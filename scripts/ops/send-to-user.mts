/**
 * 特定のお客様おひとりへ、承諾済みの文面をお送りする（LINE または メール）。
 * ★必ず三上さんの承諾済みの文面だけを送ること。--dry で宛先と文面を確認してから --send。
 *
 *   確認: npx tsx scripts/ops/send-to-user.mts --dry  --line <userId> <text.txt>
 *   送信: npx tsx scripts/ops/send-to-user.mts --send --line <userId> <text.txt>
 *   確認: npx tsx scripts/ops/send-to-user.mts --dry  --mail <userId> <text.txt>
 *
 * LINE: 本文ファイルの全文をそのまま1通で送る（宛先は users.lineUserId → userLineLinks の順で探す）。
 * メール: 1行目が件名、2行目以降が本文（HTMLは本文から自動生成）。
 * 本番の DATABASE_URL / LINE_NOTIFY_CHANNEL_ACCESS_TOKEN / RESEND_API_KEY は環境変数から読む。
 */
import fs from "node:fs";

const args = process.argv.slice(2);
const send = args.includes("--send");
const viaLine = args.includes("--line");
const viaMail = args.includes("--mail");
const rest = args.filter((a) => !a.startsWith("--"));
const userId = Number(rest[0]);
const file = rest[1];

if (!Number.isFinite(userId) || !file || (viaLine === viaMail)) {
  console.error("使い方: --dry|--send --line|--mail <userId> <text.txt>");
  process.exit(1);
}
const raw = fs.readFileSync(file, "utf8").trim();
if (raw.length === 0 || raw.length > 4900) { console.error("文面の長さが不正:", raw.length); process.exit(1); }

const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DBに接続できません"); process.exit(1); }
const { sql } = await import("drizzle-orm");

const [uRows]: any = await d.execute(sql`SELECT id, name, email, lineUserId, COALESCE(emailOptOut,0) AS optOut FROM users WHERE id = ${userId}`);
const user = (uRows ?? [])[0];
if (!user) { console.error(`user ${userId} が見つかりません`); process.exit(1); }

if (viaLine) {
  let to = user.lineUserId as string | null;
  if (!to) {
    const [lRows]: any = await d.execute(sql`SELECT lineUserId FROM userLineLinks WHERE userId = ${userId} ORDER BY id LIMIT 1`);
    to = (lRows ?? [])[0]?.lineUserId ?? null;
  }
  if (!to) { console.error(`user ${userId}（${user.name}）のLINE宛先がありません`); process.exit(1); }
  console.log(`宛先: ${user.name} / LINE ${String(to).slice(0, 10)}... / ${raw.length}字`);
  if (!send) { console.log("--- dry run（送信しません）---\n" + raw); process.exit(0); }
  const { pushTextTo } = await import("../../server/lineNotify");
  const ok = await pushTextTo(to, raw);
  console.log(ok ? "送信しました" : "送信に失敗しました");
  process.exit(ok ? 0 : 2);
}

// メール
const [subject, ...bodyLines] = raw.split("\n");
const text = bodyLines.join("\n").trim();
if (!subject || text.length < 50) { console.error("件名または本文が不正"); process.exit(1); }
if (!user.email) { console.error(`user ${userId}（${user.name}）にメールアドレスがありません`); process.exit(1); }
if (Number(user.optOut) === 1) { console.error(`user ${userId}（${user.name}）は配信停止のため送りません`); process.exit(1); }

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:15px;line-height:1.9;color:#222;max-width:640px;margin:0 auto;padding:8px 4px">` +
  text.split("\n").map((l) => {
    const t = esc(l).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#0a7c5f">$1</a>');
    if (l.startsWith("■")) return `<p style="margin:22px 0 6px;font-weight:700">${t}</p>`;
    if (l.trim() === "") return `<div style="height:8px"></div>`;
    return `<p style="margin:0">${t}</p>`;
  }).join("") + `</div>`;

console.log(`宛先: ${user.name} / ${user.email} / 件名「${subject}」/ 本文${text.length}字`);
if (!send) { console.log("--- dry run（送信しません）---\n" + text); process.exit(0); }
const { sendEmail } = await import("../../server/_core/notification");
const ok = await sendEmail({ to: user.email, subject, html });
console.log(ok ? "送信しました" : "送信に失敗しました");
process.exit(ok ? 0 : 2);
