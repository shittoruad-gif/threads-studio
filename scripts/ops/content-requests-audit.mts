/**
 * 公式LINEに届いた「投稿の中身についてのご希望」の取りこぼしを洗い出す（読み取り専用・2026-11-03）。
 *
 * 2026-11-03 三上様「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」。
 *   10/12「〇〇をお勧めしたい」、10/14「〇〇の話題はいらない」が自動の返事だけで終わり、設定に入っていなかった。
 *   過去の supportQuestions を shared/contentRequest.ts と同じ判定にかけ、設定（書き方の決まり・NGワード）に
 *   入っていないものを並べる。あわせて、
 *    - 確認のボタンを出したのに押されていないもの（category=投稿の決まり・handledAt なし）
 *    - 自動の答えに守る人のいない約束が入ったまま、担当者に回っていないもの（shared/supportAnswerGuard.ts）
 *   も出す。
 *
 * ★本番DBは読むだけ（SET SESSION TRANSACTION READ ONLY）。お客様のお名前は出さない（userId と質問文だけ）。
 *
 * 使い方（本番DBへのトンネルを張ってから）:
 *   nc -z 127.0.0.1 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)" && npx tsx scripts/ops/content-requests-audit.mts
 *   （--json で機械向けに出す）
 */
import mysql from "mysql2/promise";
import { detectContentRequest, looksLikeContentWish, CONTENT_RULE_CATEGORY, type ContentRuleProposal } from "../../shared/contentRequest";
import { hasUnkeptPromise } from "../../shared/supportAnswerGuard";
import { parseOwnerRules } from "../../shared/ownerRules";

const asJson = process.argv.includes("--json");
const conn = await mysql.createConnection(process.env.DATABASE_URL!);
await conn.query("SET SESSION TRANSACTION READ ONLY");

const [qs]: any = await conn.query(
  "SELECT id, userId, category, aiConfident, needsHuman, handledAt, handledBy, repliedAt, question, aiAnswer, createdAt FROM supportQuestions ORDER BY id",
);
const [accts]: any = await conn.query("SELECT id, userId, ownerRules FROM threadsAccounts");
const [pjs]: any = await conn.query("SELECT userId, ngWords FROM projects WHERE id NOT LIKE 'demo_%'");
await conn.end();

const rulesByUser = new Map<number, string[]>();
for (const a of accts) rulesByUser.set(Number(a.userId), [...(rulesByUser.get(Number(a.userId)) ?? []), ...parseOwnerRules(a.ownerRules)]);
const ngByUser = new Map<number, string[]>();
for (const p of pjs) {
  const words = String(p.ngWords || "").split(/[、,，\n]/).map((w) => w.trim()).filter(Boolean);
  ngByUser.set(Number(p.userId), [...(ngByUser.get(Number(p.userId)) ?? []), ...words]);
}

/** 決まりの案から、設定に入っているかを見る言葉（話題の名前・絵文字など） */
function keysOf(r: ContentRuleProposal): string[] {
  if (r.ngWord) return r.ngWord.split("や").filter(Boolean);
  const style = r.rule.match(/(絵文字|ハッシュタグ|改行|短め|長め|です・ます|くだけた|やわらかい|最後は)/);
  if (style) return [style[1]];
  const m = r.rule.match(/^「?(.+?)」?(?:という言い方は使わない|の話題は書かない|っぽい投稿は書かない|をおすすめする|を紹介する|の話を多めに入れる|を投稿に取り入れる|ではなく)/);
  return (m ? m[1] : r.rule).split("や").map((s) => s.trim()).filter(Boolean);
}

function reflected(userId: number, r: ContentRuleProposal): boolean {
  const rules = rulesByUser.get(userId) ?? [];
  const ng = ngByUser.get(userId) ?? [];
  return keysOf(r).every((k) => rules.some((x) => x.includes(k)) || (r.kind === "avoid" && ng.some((w) => w.includes(k))));
}

const fmt = (d: any) => (d ? new Date(d).toISOString().slice(0, 16).replace("T", " ") + "Z" : "-");
const oneLine = (s: any) => String(s ?? "").replace(/\s*\n\s*/g, " / ").slice(0, 120);

type Row = { id: number; userId: number; at: string; question: string; rules: string[]; status: string; how: string };
const missed: Row[] = [];
const done: Row[] = [];
const wishNoRule: Row[] = [];
const unpressed: Row[] = [];
const promises: Row[] = [];

for (const q of qs) {
  const userId = Number(q.userId);
  const base = { id: q.id, userId, at: fmt(q.createdAt), question: oneLine(q.question) };
  const handledByAuto = String(q.handledBy || "").startsWith("自動");
  if (q.category === CONTENT_RULE_CATEGORY && !q.handledAt && !Number(q.needsHuman)) {
    unpressed.push({ ...base, rules: [], status: "ボタン未押下", how: "確認を出したまま" });
  }
  if (hasUnkeptPromise(q.aiAnswer) && Number(q.aiConfident) === 1 && !Number(q.needsHuman) && !q.repliedAt) {
    promises.push({ ...base, rules: [], status: q.handledAt ? "手で対応済みの印あり" : "担当者に未着", how: oneLine(q.aiAnswer) });
  }
  const cr = detectContentRequest(String(q.question ?? ""));
  if (cr) {
    const ok = cr.rules.map((r) => reflected(userId, r));
    const row = { ...base, rules: cr.rules.map((r) => r.rule), status: ok.every(Boolean) ? "反映済み" : ok.some(Boolean) ? "一部だけ反映" : "未反映", how: "規則で判定" };
    (ok.every(Boolean) ? done : missed).push(row);
    continue;
  }
  if (looksLikeContentWish(String(q.question ?? "")) && !handledByAuto) {
    wishNoRule.push({ ...base, rules: [], status: q.handledAt || q.repliedAt ? "担当者が対応した印あり" : Number(q.needsHuman) ? "担当者に回っている" : "だれにも届いていない", how: "ご希望らしいが決まりの文にできない" });
  }
}

if (asJson) {
  console.log(JSON.stringify({ total: qs.length, missed, done, wishNoRule, unpressed, promises }, null, 2));
} else {
  const print = (title: string, rows: Row[]) => {
    console.log(`\n■ ${title}（${rows.length}件）`);
    for (const r of rows) {
      console.log(`  #${r.id} user ${r.userId} ${r.at} [${r.status}]`);
      console.log(`    文面：${r.question}`);
      if (r.rules.length) console.log(`    決まりの案：${r.rules.join(" / ")}`);
      if (r.how && !["規則で判定"].includes(r.how)) console.log(`    ${r.how.startsWith("確認") || r.how.startsWith("ご希望") ? r.how : `答え：${r.how}`}`);
    }
  };
  console.log(`supportQuestions 全${qs.length}件を点検（読み取りのみ）`);
  print("投稿の中身のご希望で、設定に入っていないもの", missed);
  print("投稿の中身のご希望で、設定に入っているもの", done);
  print("ご希望らしいが決まりの文にできないもの（人の目で確認）", wishNoRule);
  print("確認のボタンを出したまま押されていないもの", unpressed);
  print("自動の答えに守る人のいない約束が入り、担当者に届いていないもの", promises);
}
