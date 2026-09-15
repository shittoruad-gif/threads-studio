/**
 * 健康系のお店の「はじめの設定」から、生成前にどれだけ落ちるかを見る（2026-09-16）。
 *
 * 2026-09-15 三上様指示で、健康表現ガードに引っかかる表現は**プロンプトへ渡す前に**落とすようにした。
 * 落ちた結果、材料がほとんど残らない方は、投稿が薄くなる。ご本人に材料を足していただく必要があるので、
 * 夜間整備でこれを流して、朝の報告に載せる。
 *
 * 使い方（本番DBへのトンネルを張ってから）:
 *   nc -z localhost 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)" && npx tsx scripts/ops/health-scrub-audit.mts
 *
 * 読み方：★空になる＝その項目は1文字も渡らない。半分以下＝材料が痩せているので声かけの候補。
 */
import mysql from "mysql2/promise";
import { scrubSettingText, isHealthBusiness } from "../../shared/healthClaimGuard";

const FIELDS = ["strength", "proof", "target", "usp", "n1Customer", "belief", "customerWords"] as const;
const LABEL: Record<string, string> = {
  strength: "強み", proof: "実績", target: "お客さん像", usp: "USP",
  n1Customer: "N1顧客像", belief: "主張・信念", customerWords: "お客さんの生の言葉",
};

const conn = await mysql.createConnection(process.env.DATABASE_URL!);
const [rows]: any = await conn.query(
  `SELECT p.userId, u.name, p.businessType, ${FIELDS.join(", ")}
     FROM projects p
     JOIN users u ON u.id = p.userId
     JOIN subscriptions s ON s.userId = u.id
    WHERE s.status = 'active' AND s.planId <> 'free' AND p.id NOT LIKE 'demo_%'`,
);

const alerts: string[] = [];
for (const r of rows) {
  if (!isHealthBusiness(r.businessType)) continue;
  const lines: string[] = [];
  for (const k of FIELDS) {
    const v = r[k];
    if (!v || !String(v).trim()) continue;
    const s = scrubSettingText(v);
    if (!s.hits.length) continue;
    const before = String(v).replace(/\s/g, "").length;
    const after = s.text.replace(/\s/g, "").length;
    const mark = after === 0 ? " ★空になる" : after * 2 < before ? " ★半分以下" : "";
    if (mark) alerts.push(`u${r.userId} ${r.name} の「${LABEL[k]}」${mark.trim()}`);
    lines.push(`   ${LABEL[k]}: ${before}→${after}字${mark}（${[...new Set(s.hits)].join("・")}）`);
  }
  if (lines.length) console.log(`u${r.userId} ${r.name}（${String(r.businessType).split("\n")[0]}）\n${lines.join("\n")}`);
}

console.log("\n===== 朝の報告に載せる候補 =====");
console.log(alerts.length ? alerts.map((a) => "・" + a).join("\n") : "なし");
await conn.end();
