// 案の◯✕アンケートを、1アカウントのお客様へ1回だけ送る（server/draftSurvey.ts）。
// ★お客様に届く送信。三上様の明示の承諾を得てから --send を付けて実行すること。
//   付けなければ、記録もせず送る内容を表示するだけ（確認用）。
//
// 使い方:
//   npx tsx scripts/ops/send-draft-survey.mts --account=22 --file=scripts/ops/announcements/2026-09-25_prestige_survey.json
//   npx tsx scripts/ops/send-draft-survey.mts --account=22 --file=... --send
//
// file の形: { "intro": "前置きの文", "drafts": [{ "angle": "behind_scenes", "label": "仕事の中身", "content": "本文" }, ...] }
import fs from "fs";

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=");
const accountId = Number(arg("account"));
const file = arg("file");
const send = process.argv.includes("--send");
if (!accountId || !file) { console.error("--account と --file が必要です"); process.exit(1); }

const { intro, drafts } = JSON.parse(fs.readFileSync(file, "utf8"));
if (!intro || !Array.isArray(drafts) || drafts.length < 2 || drafts.length > 12) {
  console.error("intro と drafts（2〜12件）が必要です"); process.exit(1);
}

const db = await import("../../server/db");
const acc: any = await db.getThreadsAccountById(accountId);
if (!acc) { console.error("アカウントが見つかりません"); process.exit(1); }
const lineIds = await db.getLineUserIdsForUser(Number(acc.userId));
console.log(`送り先：userId=${acc.userId} @${acc.threadsUsername} LINE ${lineIds.length}件 / 案 ${drafts.length}件`);
console.log(`\n${intro}\n`);
drafts.forEach((d: any, i: number) => console.log(`--- 案${i + 1}（${d.label}・${d.angle}）\n${d.content}`));
if (!send) { console.log("\n（確認のみ。送るときは --send）"); process.exit(0); }
if (lineIds.length === 0) { console.error("LINEの送り先がありません"); process.exit(1); }

// ★二重送信の防止（2026-09-25 同じ定期タスクが二重起動し、プレステージ様へ同じ8案が2通届いた）。
//   ①同時に走った2本目は、アカウントごとのロック（MySQLのGET_LOCK・待たない）が取れず止まる
//   ②後から走った2本目は、直近20時間に同じアカウントの案が作られていれば止まる
//   意図して送り直すときだけ --force を付ける。
const force = process.argv.includes("--force");
const mysql = await import("mysql2/promise");
const lockConn = await mysql.createConnection(process.env.DATABASE_URL ?? "");
const lockName = `draft-survey-${accountId}`;
const [lockRows]: any = await lockConn.query("SELECT GET_LOCK(?, 0) AS got", [lockName]);
if (Number(lockRows?.[0]?.got) !== 1) {
  console.error("同じアカウントへの送信が、別の実行でいま進んでいます。二重送信を避けるため止めました。");
  await lockConn.end(); process.exit(1);
}
const [recent]: any = await lockConn.query(
  "SELECT surveyKey, MIN(createdAt) AS at FROM draftSurveyItems WHERE threadsAccountId = ? AND createdAt > NOW() - INTERVAL 20 HOUR GROUP BY surveyKey",
  [accountId],
);
if (recent.length > 0 && !force) {
  console.error(`直近20時間に同じアカウントへ送った案があります（${recent.map((r: any) => r.surveyKey).join(", ")}）。二重送信を避けるため止めました。送り直すときは --force を付けてください。`);
  await lockConn.end(); process.exit(1);
}

const { createSurvey, buildSurveyMessages } = await import("../../server/draftSurvey");
const { pushMessages } = await import("../../server/lineNotify");
const { surveyKey, items } = await createSurvey(accountId, drafts);
let ok = 0;
for (const id of lineIds) if (await pushMessages(id, buildSurveyMessages(items, intro))) ok++;
console.log(`\n送信：${ok}／${lineIds.length}（${surveyKey}・案ID ${items.map((x) => x.id).join(",")}）`);
await lockConn.query("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
await lockConn.end();
process.exit(ok > 0 ? 0 : 1);
