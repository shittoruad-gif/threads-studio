/**
 * フリープラン終了（10/31）のお知らせを、猶予中の方へ1回だけ送る（2026-10-03 三上様「お知らせは明日送って」・文面承諾済み）。
 *   既定は下見（送らない）。送るときだけ --send。
 *   1) 本番に規約の改定（附則）が出ているか確かめる。出ていなければ送らない
 *   2) 対象＝db.isFreeGrace の方（10/3 時点で8人）。LINEがつながっていればLINE、なければメール
 *   3) 送った方は docs/notices/free-sunset-2026-10-04.json に残し、二度送らない
 * 使い方: eval "$(bash scripts/ops/prod-env.sh DATABASE_URL LINE_NOTIFY_CHANNEL_SECRET LINE_NOTIFY_CHANNEL_ACCESS_TOKEN RESEND_API_KEY RESEND_FROM_DOMAIN SUPPORT_REPLY_TO APP_BASE_URL)"
 *         npx tsx scripts/ops/send-free-sunset-notice.mts [--send]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const SEND = process.argv.includes('--send');
const LEDGER = new URL('../../docs/notices/free-sunset-2026-10-04.json', import.meta.url);
const BASE = 'https://threads-studio.com';

const TEXT = `Threads Studio 運営です。料金プランの変更についてお知らせします。

【変わらないこと】
10月31日までは、これまでどおりフリープランでお使いいただけます。ご登録いただいた「お店の情報」とThreadsの連携は、11月以降もそのまま残ります。消えるものはありません。

【変わること】
11月1日から、無料のフリープランを終了します。投稿づくりと毎日の自動投稿は、お申し込み（最初の7日間は無料）からのご利用になります。7日間のうちに解約されれば、料金はかかりません。

お申し込みの翌朝6時に、お店の情報をもとにした1本目の投稿がこのトークに届きます。
▼ 7日間無料で始める
${BASE}/pricing

利用規約の改定内容：${BASE}/terms
ご不明な点は、このトークでお知らせください。`;

// 1) 本番に規約の改定が出ているか（画面はJSで描くので、JSの中を探す）
async function termsLive(): Promise<boolean> {
  const decode = (s: string) => s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const html = await (await fetch(`${BASE}/terms`)).text();
  const seen = new Set<string>();
  const queue = Array.from(html.matchAll(/\/assets\/[^"'\s)]+\.js/g)).map((m) => m[0]);
  while (queue.length > 0 && seen.size < 300) {
    const path = queue.shift()!;
    if (seen.has(path)) continue;
    seen.add(path);
    const js = await (await fetch(`${BASE}${path}`)).text();
    if (decode(js).includes(process.env.TERMS_PROBE || '附則（2026年10月3日改定）')) return true;
    // 画面ごとのファイルは "./Terms-xxx.js" の形で書かれている
    for (const m of js.matchAll(/(?:assets\/|\.\/)([A-Za-z0-9_.-]+\.js)/g)) { const p = `/assets/${m[1]}`; if (!seen.has(p)) queue.push(p); }
  }
  return false;
}

const live = await termsLive();
console.log(`本番の規約に附則（10/3改定）: ${live ? 'あり' : 'なし'}`);
if (SEND && !live) { console.error('規約の改定がまだ本番に出ていないため、送りません'); process.exit(2); }

const db: any = await import('../../server/db');
const d = await db.getDb();
const { sql } = await import('drizzle-orm');
const users = ((await d.execute(sql`SELECT id, name, email, emailOptOut FROM users`))[0] as any[]);
const targets: any[] = [];
for (const u of users) if (await db.isFreeGrace(u.id)) targets.push(u);
const ledger: Record<string, any> = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
console.log(`対象 ${targets.length}人（送信ずみ ${Object.keys(ledger).length}人）`);

const { pushMessages } = await import('../../server/lineNotify');
const { sendEmail } = await import('../../server/_core/notification');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<div style="font-family:-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:15px;line-height:1.9;color:#222;max-width:640px;margin:0 auto">${TEXT.split('\n').map((l) => l.trim() === '' ? '<div style="height:8px"></div>' : `<p style="margin:0">${esc(l).replace(/(https:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join('')}</div>`;

for (const u of targets) {
  if (ledger[u.id]) { console.log(`- ${u.id} 送信ずみのため飛ばす`); continue; }
  const lineIds: string[] = await db.getLineUserIdsForUser(u.id).catch(() => []);
  const via = lineIds.length > 0 ? 'LINE' : (u.email ? 'メール' : 'なし');
  if (!SEND) { console.log(`- ${u.id} ${u.name ?? ''} → ${via}（下見）`); continue; }
  let ok = false;
  if (lineIds.length > 0) {
    for (const to of lineIds) if (await pushMessages(to, [{ type: 'text', text: TEXT }])) ok = true;
  } else if (u.email) {
    ok = await sendEmail({ to: u.email, subject: '【Threads Studio】料金プランの変更（フリープランの終了）のお知らせ', html });
  }
  console.log(`- ${u.id} → ${via} ${ok ? '送信' : '失敗'}`);
  if (ok) { ledger[u.id] = { via, at: new Date().toISOString() }; writeFileSync(LEDGER, JSON.stringify(ledger, null, 2)); }
}
process.exit(0);
