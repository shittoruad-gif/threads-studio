/**
 * 公式LINE「Threads Studio 通知」のリッチメニューを作成して既定に設定する。
 *
 * トーク画面下部にフルサイズ6ボタン（2段×3列）を出す。
 * ★アプリ（LIFF）は開かない。すべて postback でサーバーに届き、
 *   トーク内の返信だけで承認・書き直し・設定変更まで完結する。
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

const MENU_NAME = 'threads-studio-main-v5';
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

// ── メニュー画像（SVG→PNG）。ブランド色はアプリと同系のグリーン ──
const cellW = W / 3;
const cellH = H / 2;
const svg = `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#0E2A38"/>
  ${buttons
    .map((b, i) => {
      const x = (i % 3) * cellW;
      const y = Math.floor(i / 3) * cellH;
      const cx = x + cellW / 2;
      return `
    <rect x="${x + 24}" y="${y + 24}" width="${cellW - 48}" height="${cellH - 48}" rx="28" fill="#F4FAFA"/>
    <circle cx="${cx}" cy="${y + cellH / 2 - 130}" r="86" fill="#0E8388"/>
    <text x="${cx}" y="${y + cellH / 2 - 108}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="72" fill="#FFFFFF" font-weight="bold">${i + 1}</text>
    <text x="${cx}" y="${y + cellH / 2 + 90}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="86" fill="#13343B" font-weight="bold">${b.label1}</text>
    <text x="${cx}" y="${y + cellH / 2 + 200}" text-anchor="middle" font-family="Hiragino Sans, sans-serif" font-size="56" fill="#4C6B67">${b.label2}</text>`;
    })
    .join('')}
</svg>`;

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

// 1) 旧バージョンを含む threads-studio-main-* を削除（冪等・置き換え）
const list = await api('https://api.line.me/v2/bot/richmenu/list');
for (const m of list?.richmenus ?? []) {
  if (m.name?.startsWith('threads-studio-main-')) {
    await api(`https://api.line.me/v2/bot/richmenu/${m.richMenuId}`, { method: 'DELETE' });
    console.log('古いメニューを削除:', m.richMenuId, m.name);
  }
}

// 2) メニュー本体を作成
const created = await api('https://api.line.me/v2/bot/richmenu', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    size: { width: W, height: H },
    selected: true,
    name: MENU_NAME,
    chatBarText: 'メニューを開く',
    areas: buttons.map((b, i) => ({
      bounds: { x: (i % 3) * cellW, y: Math.floor(i / 3) * cellH, width: cellW, height: cellH },
      action: { type: 'postback', data: b.data, displayText: b.label1 },
    })),
  }),
});
const id = created.richMenuId;
console.log('作成:', id);

// 3) 画像をアップロード
const png = await sharp(Buffer.from(svg)).png().toBuffer();
await api(`https://api-data.line.me/v2/bot/richmenu/${id}/content`, {
  method: 'POST',
  headers: { 'Content-Type': 'image/png' },
  body: png,
});
console.log('画像アップロード完了');

// 4) 全ユーザーの既定メニューに設定
await api(`https://api.line.me/v2/bot/user/all/richmenu/${id}`, { method: 'POST' });
console.log('既定メニューに設定しました');
