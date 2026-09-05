/**
 * Threads Studio 毎朝の点検。
 *
 * 見るもの:
 *   1. 設定が途中で止まっているお客様（誰が・どの段階か）
 *   2. 自動タスクが動いているか（前回の実行時刻）
 *   3. 担当者の返信待ちになっているご質問
 *   4. 契約中なのに投稿が止まっている方
 *
 * 使い方: node scripts/ops/daily-check.mjs
 * 認証は Coolify の env から取得するので、事前準備は不要。
 */
import { SignJWT } from 'jose';

const COOLIFY = 'http://163.44.103.9:8000';
const APP_UUID = 'g89zg5s4u6xr08gp2b0dptcn';
const BASE = 'https://threads-studio.com';
const ADMIN_OPENID = 'email_momen_t421@yahoo.co.jp';

async function env() {
  const r = await fetch(`${COOLIFY}/api/v1/applications/${APP_UUID}/envs`, {
    headers: { Authorization: `Bearer ${process.env.COOLIFY_TOKEN}` },
  });
  const list = await r.json();
  const out = {};
  for (const e of list) if (!(e.key in out)) out[e.key] = e.value;
  return out;
}

async function main() {
  if (!process.env.COOLIFY_TOKEN) {
    console.error('COOLIFY_TOKEN が未設定です。');
    process.exit(1);
  }
  const e = await env();
  const secret = new TextEncoder().encode(e.JWT_SECRET);
  const mint = (openId) => new SignJWT({ openId, appId: e.VITE_APP_ID, name: 'ops' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('20m').sign(secret);
  const admin = await mint(ADMIN_OPENID);
  const get = async (proc, input = null) => {
    const r = await fetch(`${BASE}/api/trpc/${proc}?batch=1&input=` + encodeURIComponent(JSON.stringify({ "0": { json: input } })), { headers: { Cookie: `app_session_id=${admin}` } });
    const j = await r.json();
    if (j[0]?.error) throw new Error(`${proc}: ${j[0].error.json?.message}`);
    return j[0]?.result?.data?.json;
  };

  const today = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`===== Threads Studio 点検 ${today} =====\n`);

  // ── 1. 設定が途中で止まっているお客様
  const stuck = await get('admin.listStuckUsers');
  const all = await get('admin.getAllUsers');
  const byId = new Map((all || []).map(u => [u.id, u]));
  console.log(`■ 設定が途中で止まっているお客様: ${stuck.length}件`);
  for (const s of stuck) {
    const u = byId.get(s.userId);
    const age = u?.createdAt ? Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000) : '?';
    // LINE連携の有無（案内がLINEで届くかメールか）
    let linked = false;
    try {
      const uj = await mint(`email_${s.email}`);
      const r = await fetch(`${BASE}/api/trpc/lineNotify.getStatus?batch=1&input=` + encodeURIComponent(JSON.stringify({ "0": { json: null } })), { headers: { Cookie: `app_session_id=${uj}` } });
      linked = Boolean((await r.json())[0]?.result?.data?.json?.linked);
    } catch { /* 判定できなくても続ける */ }
    const route = linked ? 'LINEで案内' : (age > 30 ? '案内対象外(30日超)' : 'メールで案内');
    console.log(`  ${String(s.name || '(名前なし)').padEnd(14)} ${String(s.email).padEnd(32)} ${s.key.padEnd(24)} 登録${age}日 / ${route}${s.notifyEnabled ? '' : ' / 案内OFF'}`);
  }
  if (stuck.length === 0) console.log('  なし（全員、設定が整っています）');

  // ── 1.5 業種と登録内容のズレ（呉服店に整体の選択肢が入っていた・2026-09-06 三上様指示）
  try {
    const mm = await get('admin.listIndustryMismatches');
    console.log(`\n■ 業種と登録内容のズレ: ${mm.length}件`);
    for (const m of mm.slice(0, 10)) {
      console.log(`  ${String(m.name || '').padEnd(12)} ${String(m.email || '').padEnd(32)} ${m.storeName || ''}（${m.businessType || '業種不明'}）`);
      console.log(`    ${m.summary}`);
    }
    if (mm.length === 0) console.log('  なし');
  } catch (e) {
    console.log(`\n■ 業種と登録内容のズレ: 取得できませんでした（${String(e).slice(0, 80)}）`);
  }

  // ── 2. 担当者の返信待ち
  const q = await get('admin.listQuestions', { needsHumanOnly: true });
  const waiting = (q?.questions || []).filter(x => !x.repliedAt);
  console.log(`\n■ 担当者の返信待ち: ${waiting.length}件`);
  for (const w of waiting.slice(0, 10)) {
    console.log(`  #${w.id} ${String(w.question).replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  if (waiting.length === 0) console.log('  なし');

  // ── 3. 直近のご質問（自動応答が答えられているか）
  const recent = await get('admin.listQuestions', { limit: 30 });
  const rq = recent?.questions || [];
  const last24 = rq.filter(x => Date.now() - new Date(x.createdAt).getTime() < 86400000);
  const unanswered = last24.filter(x => x.aiConfident !== 1);
  console.log(`\n■ 24時間のご質問: ${last24.length}件（うち自動で答えられなかったもの ${unanswered.length}件）`);
  for (const x of unanswered.slice(0, 5)) {
    console.log(`  ${String(x.question).replace(/\s+/g, ' ').slice(0, 70)}`);
  }
  console.log(`  分類の多い順: ${(recent?.categoryCounts || []).slice(0, 5).map(c => `${c.category}(${c.count})`).join(' / ') || 'なし'}`);

  // ── 4. 契約中の方の投稿状況
  console.log('\n■ 契約中の方の設定');
  for (const u of all || []) {
    const plan = u.subscription?.planId || u.planId;
    if (!plan || plan === 'free') continue;
    try {
      const uj = await mint(`email_${u.email}`);
      const call = async (proc) => {
        const r = await fetch(`${BASE}/api/trpc/${proc}?batch=1&input=` + encodeURIComponent(JSON.stringify({ "0": { json: null } })), { headers: { Cookie: `app_session_id=${uj}` } });
        const j = await r.json();
        return j[0]?.error ? null : j[0]?.result?.data?.json;
      };
      const s = await call('autoPost.getSettings');
      const accs = await call('threads.list');
      const pjs = await call('project.list');
      const FREQ = { daily: '1日1回', twice_daily: '1日2回', three_daily: '1日3回' };
      // ★「未紐づけ」は、お店の情報が複数あるときだけ困りごとになる。
      //   情報が1件しかなければ、アプリはその1件を使うので実害はない
      //   （server/nextAction.ts も accounts > usable のときだけご案内している）。
      //   条件を付けずに出していたため、問題のない方まで毎朝★が付いていた。
      const usable = (pjs || []).filter(p => !String(p.id).startsWith('demo_') && p.businessType && p.area && p.target && p.strength);
      const unlinked = (accs || []).filter(a => !a.defaultProjectId).length;
      const risky = unlinked > 0 && (accs || []).length > usable.length;
      console.log(`  ${String(u.name || '').padEnd(14)} ${plan.padEnd(16)} 自動投稿:${s?.autoPostEnabled ? FREQ[s.autoPostFrequency] || s.autoPostFrequency : 'OFF'} / 公開前確認:${s?.autoPostRequireApproval ? 'する' : 'しない'} / 連携${(accs || []).length}件${risky ? ` (★お店の情報が未紐づけ${unlinked}件・取り違えの恐れ)` : ''}`);
    } catch (err) {
      console.log(`  ${u.name}: 取得できず (${String(err.message).slice(0, 40)})`);
    }
  }

  console.log('\n===== 点検おわり =====');
}

main().catch(e => { console.error('点検に失敗:', e.message); process.exit(1); });
