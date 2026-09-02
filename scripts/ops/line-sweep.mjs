// LINEのボタン・自由入力を総当たりで叩いて、無反応／的外れがないかを見るための検証スクリプト。
// 本番では使わない（ローカルQA専用）。送信はせず、返す内容を表示するだけ。
//
// 使い方（ローカルQA環境で）:
//   QA_SAFE_MODE=1 LINE_NOTIFY_CHANNEL_ACCESS_TOKEN=dummy-local npx tsx scripts/ops/line-sweep.mjs
//
// 既定の検証用アカウントは SWEEP_LINE_USER（userLineLinks に紐づけた検証用のLINE ID）。
// ※「固定投稿を作る」系のボタンは押すたびにAIで本文を作るため、生成の呼び出しが発生する。
import 'dotenv/config';

const LINE_USER = process.env.SWEEP_LINE_USER || 'Unightqa0903test';
const { handlePostback, handleFreeText } = await import('../../server/lineChatHandler.ts');

const BUTTONS = [
  'm=menu', 'm=posts', 'm=posts&one=1', 'm=posts&all=1', 'm=stats', 'm=profile',
  'm=connect', 'm=account', 'm=help', 'm=setup', 'm=settings', 'm=comments',
  'm=staff', 'm=makepin', 'm=makepin&nourl=1', 'm=link', 'm=signup', 'm=refcode', 'm=cancel',
  'c=edit', 'c=resume', 'c=save', 'c=seturl', 'c=setupauto&v=on', 'c=setupauto&v=off',
  'c=start&mode=store', 'c=start&mode=personal',
  's=plan', 's=ng', 's=auto&v=on', 's=auto&v=off', 's=appr&v=on', 's=appr&v=off',
  's=len&v=short', 's=len&v=long',
  'n=on', 'n=off', 'n=pinhow', 'n=pinned',
  // よくあるご質問（HELP_TOPICS の key と揃えること）
  'h=flow', 'h=auto', 'h=ng', 'h=member', 'h=multi', 'h=makepin', 'h=pin', 'h=stop',
];

const TEXTS = [
  'メニュー',
  '投稿を作って',
  'ネタを作ってほしい',
  '料金はいくらですか？',
  '解約したいです',
  '投稿を作って',
  '固定投稿を作りたい',
  'Threadsとつなげたい',
  '小学生が足を捻って我慢していたが、当院に来てエコー観察したら骨折があった（整形外科で確定診断）、当院でリハビリを行い問題なくサッカーに復帰',
  'ありがとうございます',
  'あ',
  '設定',
];

function summarize(res) {
  if (res === null) return 'null（無反応）';
  if (!Array.isArray(res)) return 'NOT-ARRAY: ' + JSON.stringify(res).slice(0, 120);
  if (res.length === 0) return '[]（無反応）';
  return res.map(m => {
    if (m && m.type === 'text') {
      const qs = m.quickReply?.items?.map(i => i.action?.label).filter(Boolean) ?? [];
      return String(m.text).replace(/\n/g, ' / ').slice(0, 150) + (qs.length ? `  «${qs.join('|')}»` : '');
    }
    if (m && m.type === 'flex') return `[flex] ${String(m.altText || '').slice(0, 80)}`;
    return `[${m?.type ?? '?'}]`;
  }).join('  ||  ');
}

console.log('===== BUTTONS =====');
for (const b of BUTTONS) {
  try {
    const r = await handlePostback(LINE_USER, b);
    console.log(`\n▶ ${b}\n  ${summarize(r)}`);
  } catch (e) {
    console.log(`\n▶ ${b}\n  ★THROW: ${String(e).slice(0, 200)}`);
  }
}

console.log('\n\n===== FREE TEXT =====');
const db = await import('../../server/db.ts');
for (const t of TEXTS) {
  try {
    // 直前のボタンで入力待ちになっていると、次の文章がそれとして食われてしまう。
    // 1件ずつ「入力待ちなし」から始める。
    await db.clearLineChatState(LINE_USER);
    const r = await handleFreeText(LINE_USER, t);
    console.log(`\n▶ 「${t.slice(0, 40)}」\n  ${summarize(r)}`);
  } catch (e) {
    console.log(`\n▶ 「${t.slice(0, 40)}」\n  ★THROW: ${String(e).slice(0, 200)}`);
  }
}
process.exit(0);
