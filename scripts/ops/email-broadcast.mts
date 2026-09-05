/**
 * 登録済みのお客様へ、承諾済みの文面をメールで一斉送信する。
 * ★必ず三上さんの承諾済みの文面だけ。--dry で宛先と件名を確認してから --send。
 *   確認: npx tsx scripts/ops/email-broadcast.mts --dry  <text.txt>
 *   送信: npx tsx scripts/ops/email-broadcast.mts --send <text.txt>
 * 文面ファイルの1行目が件名、2行目以降が本文（プレーンテキスト。HTMLは本文から自動生成）。
 * 宛先: メール認証済み・配信停止でない・テスト用(example.*)でない全ユーザー。
 * 本番の DATABASE_URL / RESEND_API_KEY / SUPPORT_REPLY_TO は環境変数から読む。
 */
import fs from "node:fs";
const args = process.argv.slice(2);
const send = args.includes("--send");
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("文面ファイルを指定してください"); process.exit(1); }
const raw = fs.readFileSync(file, "utf8").trim();
const [subject, ...rest] = raw.split("\n");
const text = rest.join("\n").trim();
if (!subject || text.length < 50) { console.error("件名または本文が不正"); process.exit(1); }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:15px;line-height:1.9;color:#222;max-width:640px;margin:0 auto;padding:8px 4px">` +
  text.split("\n").map((l) => {
    const t = esc(l).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#0a7c5f">$1</a>');
    if (l.startsWith("■")) return `<p style="margin:22px 0 6px;font-weight:700">${t}</p>`;
    if (l.trim() === "") return `<div style="height:8px"></div>`;
    return `<p style="margin:0">${t}</p>`;
  }).join("") + `</div>`;
const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const { sql } = await import("drizzle-orm");
// 宛先：配信停止でない実在のお客様。メール未認証でも「有料契約あり／公式LINE連携あり／紹介コード適用あり」なら送る
//（セミナー参加で登録した方は未認証のままが多い）。誰とも接点の無い未認証アカウントは送らない。
const rows: any = await d.execute(sql`
  SELECT u.id, u.name, u.email FROM users u
  WHERE u.email IS NOT NULL AND u.email <> '' AND COALESCE(u.emailOptOut,0) = 0
    AND u.email NOT LIKE '%example.%' AND u.email NOT LIKE '%@test.%'
    AND u.email NOT LIKE '%@threads-studio.com' AND u.email NOT IN ('shittoru.ad@gmail.com','shittoru@s-toru.com')
    AND (
      u.emailVerified = 1
      OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.userId = u.id AND s.planId <> 'free' AND s.status IN ('active','trialing'))
      OR EXISTS (SELECT 1 FROM userLineLinks l WHERE l.userId = u.id)
      OR EXISTS (SELECT 1 FROM userCoupons c WHERE c.userId = u.id)
    )
  ORDER BY u.id`);
const list: Array<{ id: number; name: string; email: string }> = ((rows as any)[0] ?? []).map((r: any) => ({ id: Number(r.id), name: String(r.name ?? ""), email: String(r.email) }));
console.log(`件名: ${subject}\n宛先 ${list.length} 名`);
for (const u of list) console.log(`  ${u.id}\t${u.name}\t${u.email}`);
if (!send) { console.log("\n--- dry run（送信しません）---"); process.exit(0); }
const { sendEmail } = await import("../../server/_core/notification");
let ok = 0, ng = 0;
for (const u of list) {
  const r = await sendEmail({ to: u.email, subject, html } as any);
  if (r) ok++; else { ng++; console.error("失敗:", u.email); }
  await new Promise((res) => setTimeout(res, 400));
}
console.log(`送信完了: 成功 ${ok} / 失敗 ${ng}`);
process.exit(ng > 0 ? 2 : 0);
