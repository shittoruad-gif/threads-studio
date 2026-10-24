// ローカルQA専用：LINEの「はじめの設定」20問を「これでOK／スキップ」で最後（登録→自動投稿の案内）まで進める。
// 送信はせず、返す内容を表示するだけ。夜間整備の「はじめの設定20問を最後まで通せるか」の確認用。
// 使い方：env -u DATABASE_URL QA_SAFE_MODE=1 LINE_NOTIFY_CHANNEL_ACCESS_TOKEN=dummy-local npx tsx scripts/ops/line-setup-walk.mjs
import 'dotenv/config';
const U = process.env.SWEEP_LINE_USER || 'Unightqa0903test';
const { handlePostback, handleFreeText } = await import('../../server/lineChatHandler.ts');
const db = await import('../../server/db.ts');
await db.clearLineChatState(U);
let r = await handlePostback(U, 'c=start&mode=store');
for (let i = 0; i < 30; i++) {
  const msgs = Array.isArray(r) ? r : [];
  const last = msgs.at(-1);
  const text = msgs.map(m => m?.text ?? `[${m?.type}] ${m?.altText ?? ''}`).join(' || ').replace(/\n/g, ' / ');
  const items = msgs.flatMap(m => m?.quickReply?.items ?? []).map(x => x.action);
  console.log(`#${i} ${text.slice(0, 160)}\n   «${items.map(a => a.label).join('|')}»`);
  if (!msgs.length) { console.log('★無反応'); break; }
  const ok = items.find(a => /これでOK|次へ|このまま|スキップ|あとで|保存/.test(a.label))
    ?? items.find(a => !/やめる|中断|担当者|メニュー/.test(a.label) && (a.type === 'postback' || a.type === 'message'));
  if (!ok) { console.log('END（押すボタンなし）'); break; }
  if (/やっぱり/.test(ok.label)) { console.log('END（登録まで完了）'); break; }
  console.log(`   → 押す「${ok.label}」 ${ok.type} ${ok.data ?? ok.text}`);
  r = ok.type === 'postback' ? await handlePostback(U, ok.data) : await handleFreeText(U, ok.text);
}
process.exit(0);
