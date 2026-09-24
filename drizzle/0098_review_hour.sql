-- 2026-09-24 三上様指示「クライアントが何時に送られてくるのが一番見やすいかを聞き、
--   昼12時に見られるならそれより前に送る、夜9時に見られるなら夜9時に次の日の案を送って判断してもらう」。
--   users.reviewHour … 確認しやすい時間（JSTの時）。NULL＝未設定＝今までどおり朝6時
--   scheduledPosts.forDate … 前の晩に翌日分を作ったときの「何日の分か」。NULL＝作った日の分（今までどおり）
ALTER TABLE `users` ADD COLUMN `reviewHour` tinyint NULL;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `forDate` date NULL;
