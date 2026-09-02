/**
 * すでに有料プランに切り替わっているのに、自動投稿の回数が1日1回のままの方を
 * プランの上限（1日3回）に引き上げる。1回だけ実行する用。
 *
 * 実行前に必ず --dry で対象を確認すること。
 *   確認: COOLIFY_TOKEN=... npx tsx <このファイル> --dry
 *   実行: COOLIFY_TOKEN=... npx tsx <このファイル> --apply
 *
 * ※ threads_studio ディレクトリの中で実行すること（jose と shared/plans を使うため）
 */
import { SignJWT } from 'jose';
import { getPlan } from '../../shared/plans';

const COOLIFY = 'http://163.44.103.9:8000';
const APP = 'g89zg5s4u6xr08gp2b0dptcn';
const BASE = 'https://threads-studio.com';
const APPLY = process.argv.includes('--apply');

const r = await fetch(`${COOLIFY}/api/v1/applications/${APP}/envs`, {
  headers: { Authorization: `Bearer ${process.env.COOLIFY_TOKEN}` },
});
const list = await r.json();
const e: any = {};
for (const x of list) if (!(x.key in e)) e[x.key] = x.value;
const secret = new TextEncoder().encode(e.JWT_SECRET);
const mint = (o: string) =>
  new SignJWT({ openId: o, appId: e.VITE_APP_ID, name: 'ops' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('20m').sign(secret);

const call = async (t: string, p: string, input: any = null, mutation = false) => {
  const url = `${BASE}/api/trpc/${p}?batch=1`;
  if (mutation) {
    const rr = await fetch(url, {
      method: 'POST',
      headers: { Cookie: `app_session_id=${t}`, 'Content-Type': 'application/json', Origin: BASE },
      body: JSON.stringify({ '0': { json: input } }),
    });
    const j = await rr.json();
    return j[0]?.error ? { err: j[0].error.json?.message } : j[0]?.result?.data?.json;
  }
  const rr = await fetch(url + '&input=' + encodeURIComponent(JSON.stringify({ '0': { json: input } })), {
    headers: { Cookie: `app_session_id=${t}` },
  });
  const j = await rr.json();
  return j[0]?.error ? { err: j[0].error.json?.message } : j[0]?.result?.data?.json;
};

const admin = await mint('email_momen_t421@yahoo.co.jp');
const all: any = await call(admin, 'admin.getAllUsers');
const F: any = { daily: 1, twice_daily: 2, three_daily: 3 };

console.log(APPLY ? '=== 実行します ===' : '=== 確認のみ（変更しません）===');
for (const u of all || []) {
  const planId = u.subscription?.planId || u.planId;
  if (!planId || planId === 'free') continue;
  const max = getPlan(planId)?.features.maxAutoPostsPerDay ?? 0;
  if (max <= 1) continue;
  const tok = await mint(`email_${u.email}`);
  const s: any = await call(tok, 'autoPost.getSettings');
  const cur = F[s?.autoPostFrequency] ?? 1;
  if (cur >= max) continue;
  console.log(`${u.name} <${u.email}> plan=${planId} ${cur}回 → ${max}回`);
  if (APPLY) {
    const res = await call(tok, 'autoPost.updateSettings',
      { autoPostFrequency: max >= 3 ? 'three_daily' : 'twice_daily' }, true);
    console.log('  結果:', JSON.stringify(res));
  }
}
console.log('=== おわり ===');
