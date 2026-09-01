/**
 * 公式LINE「Threads Studio 通知」のリッチメニューを作成して既定に設定する。
 *
 * リッチメニューを2種類つくって設置する。
 *   ① onboarding（未連携の方むけ・2ボタン）… 既定メニュー。「連携する」「アカウントを持っていない」
 *   ② main（連携済みの方むけ・6ボタン）… 連携が成立した人だけ、この menu に切り替える
 * ★アプリ（LIFF）は開かない。すべて postback でサーバーに届き、
 *   トーク内の返信だけで承認・書き直し・設定変更まで完結する。
 * ※ 既定を onboarding にしているのは、すでに友だち追加済みの方にも
 *   「連携する」ボタンが必ず見えるようにするため（あいさつ文は再送されないため）。
 *
 * 使い方（一度だけ実行）:
 *   LINE_NOTIFY_CHANNEL_ACCESS_TOKEN=xxx node scripts/setup-line-richmenu.mjs
 *
 * 再実行すると同名の古いメニューを削除して作り直す（冪等）。
 * 画像はスクリプト内のSVGから生成する（絵文字不使用・sharpはdevDependenciesを利用）。
 */
import sharp from 'sharp';

const TOKEN = process.env.LINE_NOTIFY_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('LINE_NOTIFY_CHANNEL_ACCESS_TOKEN を環境変数で指定してください');
  process.exit(1);
}

const MAIN_NAME = 'threads-studio-main-v6';
const ONBOARDING_NAME = 'threads-studio-onboarding-v1';
const W = 2500;
const H = 1686;
// ★2026-09-01: Webビュー（LIFF）を開かず、トーク内のやり取りで完結させる。
//   ボタンはすべて postback。サーバー(lineChatHandler)が返信を組み立てる。
const buttons = [
  { label1: '今日の投稿', label2: '承認・書き直し・見送り', data: 'm=posts' },
  { label1: 'コメント', label2: '新着の確認', data: 'm=comments' },
  { label1: '設定', label2: '自動投稿・確認・NGワード', data: 'm=settings' },
  { label1: '投稿の成績', label2: '直近の投稿数と反応', data: 'm=stats' },
  { label1: 'お店の情報', label2: '登録内容の確認・修正', data: 'm=profile' },
  { label1: '使い方', label2: '困ったらまずここ', data: 'm=help' },
];

// 未連携の方むけ（既定メニュー）。まず連携してもらうことだけに絞る。
const onboardingButtons = [
  { label1: '連携する', label2: 'ご登録のアカウントとつなぐ', data: 'm=link' },
  { label1: 'アカウントを持っていない', label2: 'まずは新規登録から', data: 'm=signup' },
];

// ── メニュー画像（SVG→PNG）。ブランド色はアプリと同系のグリーン ──
function buildSvg(items, cols, rows) {
  const cw = W / cols;
  const ch = H / rows;
  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#0E2A38"/>
  ${items
    .map((b, i) => {
      const x = (i % cols) * cw;
      const y = Math.floor(i / cols) * ch;
      const cx = x + cw / 2;
      const big = cols === 1;
      return `
    <rect x="${x + 24}" y="${y + 24}" width="${cw - 48}" height="${ch - 48}" rx="28" fill="#F4FAFA"/>
    <circle cx="${cx}" cy="${y + ch / 2 - (big ? 150 : 130)}" r="${big ? 96 : 86}" fill="#0E8388"/>
    <text x="${cx}" y="${y + ch / 2 - (big ? 122 : 108)}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="${big ? 84 : 72}" fill="#FFFFFF" font-weight="bold">${i + 1}</text>
    <text x="${cx}" y="${y + ch / 2 + (big ? 100 : 90)}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="${big ? 104 : 86}" fill="#13343B" font-weight="bold">${b.label1}</text>
    <text x="${cx}" y="${y + ch / 2 + (big ? 220 : 200)}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="${big ? 62 : 56}" fill="#4C6B67">${b.label2}</text>`;
    })
    .join('')}
</svg>`;
}

const api = async (url, opts = {}) => {
  const res = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 200 && res.headers.get('content-type')?.includes('json') ? res.json() : null;
};

// 1) 旧バージョンを削除（冪等・置き換え）
const list = await api('https://api.line.me/v2/bot/richmenu/list');
for (const m of list?.richmenus ?? []) {
  if (m.name?.startsWith('threads-studio-main-') || m.name?.startsWith('threads-studio-onboarding-')) {
    await api(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE' });
    console.log('古いメニューを削除:', m.richMenuId, m.name);
  }
}

/** メニューを1つ作って画像まで載せる */
async function createMenu(name, items, cols, rows, chatBarText) {
  const cw = W / cols;
  const ch = H / rows;
  const created = await api('https://api.line.me/v2/bot/richmenu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      size: { width: W, height: H },
      selected: true,
      name,
      chatBarText,
      areas: items.map((b, i) => ({
        bounds: { x: (i % cols) * cw, y: Math.floor(i / cols) * ch, width: cw, height: ch },
        action: { type: 'postback', data: b.data, displayText: b.label1 },
      })),
    }),
  });
  const id = created.richMenuId;
  const png = await sharp(Buffer.from(buildSvg(items, cols, rows))).png().toBuffer();
  await api(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: png,
  });
  console.log(`作成: ${name} = ${id}`);
  return id;
}

const mainId = await createMenu(MAIN_NAME, buttons, 3, 2, 'メニューを開く');
const onboardingId = await createMenu(ONBOARDING_NAME, onboardingButtons, 1, 2, 'まず連携してください');

// 2) 既定は「未連携むけ」。連携が成立した人だけサーバーが main に切り替える。
await api(`https://api.line.me/v2/bot/user/all/richmenu/${onboardingId}`, { method: 'POST' });
console.log('既定メニュー（未連携むけ）を設定しました');

console.log('\n--- 環境変数に設定してください ---');
console.log(`LINE_RICHMENU_MAIN_ID=${mainId}`);
console.log(`LINE_RICHMENU_ONBOARDING_ID=${onboardingId}`);
