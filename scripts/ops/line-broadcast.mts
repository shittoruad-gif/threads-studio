/**
 * 公式LINE（Threads Studio @936rschf）の友だち全員へ、テキストを一斉送信する。
 * ★必ず三上さんの承諾済みの文面だけを送ること。--dry で対象と文面を確認してから --send。
 *   確認: npx tsx scripts/ops/line-broadcast.mts --dry  <text1.txt> [text2.txt]
 *   送信: npx tsx scripts/ops/line-broadcast.mts --send <text1.txt> [text2.txt]
 * 本番のDB/トークンは環境変数（DATABASE_URL / LINE_NOTIFY_CHANNEL_ACCESS_TOKEN）から読む。
 */
import fs from "node:fs";
const args = process.argv.slice(2);
const send = args.includes("--send");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length === 0) { console.error("文面ファイルを指定してください"); process.exit(1); }
const texts = files.map((f) => fs.readFileSync(f, "utf8").trim());
for (const t of texts) if (t.length === 0 || t.length > 4900) { console.error("文面の長さが不正:", t.length); process.exit(1); }
const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const { sql } = await import("drizzle-orm");
const rows: any = await d.execute(sql`SELECT lineUserId FROM lineFollowers WHERE optOut = 0`);
const ids: string[] = ((rows as any)[0] ?? []).map((r: any) => String(r.lineUserId));
console.log(`対象 ${ids.length} 名 / 文面 ${texts.length} 通（${texts.map((t) => t.length + "字").join(", ")}）`);
if (!send) { console.log("--- dry run（送信しません）---"); texts.forEach((t, i) => console.log(`\n[${i + 1}]\n${t}`)); process.exit(0); }
const { pushMessages } = await import("../../server/lineNotify");
let ok = 0, ng = 0;
for (const to of ids) {
  const r = await pushMessages(to, texts.map((text) => ({ type: "text", text })));
  if (r) ok++; else ng++;
  await new Promise((res) => setTimeout(res, 300));
}
console.log(`送信完了: 成功 ${ok} / 失敗 ${ng}`);
process.exit(ng > 0 ? 2 : 0);
