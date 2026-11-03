/**
 * アカウントごとに自動投稿の時刻を決めておく（threadsAccounts.fixedPostHours・shared/fixedPostHours.ts）。
 *   npx tsx scripts/ops/set-fixed-post-hours.mts --account <id> --hours 12,15 [--dry-run]
 *   解除（今まで通りに戻す）: --hours none
 * その日の自動 N 本は、決めた時刻の前から N 個（分はちょうど0分）。足りない分は今まで通りの決め方。
 * 本番DBはトンネル（eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"）で。--dry-run は読むだけ。
 */
const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const dryRun = args.includes("--dry-run");
const accountId = Number(arg("--account"));
const hoursArg = arg("--hours");
if (!Number.isInteger(accountId) || accountId <= 0 || hoursArg === undefined) {
  console.error("usage: --account <id> --hours <12,15 | none> [--dry-run]");
  process.exit(1);
}

const { validateFixedPostHours } = await import("../../shared/fixedPostHours");
const clear = hoursArg.trim().toLowerCase() === "none";
const v = clear ? ({ ok: true, hours: [], value: "" } as const) : validateFixedPostHours(hoursArg);
if (!v.ok) { console.error(`時刻の指定が正しくありません: ${v.error}`); process.exit(1); }
if (!clear && v.hours.length === 0) { console.error("解除するときは --hours none"); process.exit(1); }
const next: string | null = v.value === "" ? null : v.value;

const db = await import("../../server/db");
const d = await db.getDb();
if (!d) { console.error("DB に接続できません（DATABASE_URL）"); process.exit(1); }
const { sql } = await import("drizzle-orm");
const read = async () => ((await d.execute(sql`SELECT id, fixedPostHours FROM threadsAccounts WHERE id = ${accountId}`)) as any)[0]?.[0];
const before = await read();
if (!before) { console.error(`account ${accountId} が見つかりません`); process.exit(1); }
console.log(`account ${accountId}: ${before.fixedPostHours ?? "（NULL＝今まで通り）"} → ${next ?? "（NULL＝今まで通り）"}`);
if (dryRun) { console.log("--dry-run のため書き込みません"); process.exit(0); }
if ((before.fixedPostHours ?? null) === next) { console.log("変更なし"); process.exit(0); }
await d.execute(sql`UPDATE threadsAccounts SET fixedPostHours = ${next} WHERE id = ${accountId}`);
console.log("設定後:", await read());
console.log("※ すでに予約済みの投稿の時刻は変わりません（次に作る分から）。");
process.exit(0);
