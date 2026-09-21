-- 2026-09-21 三上様指示
--   「2日連続でスキップされてしまった場合は、こちらから『追加情報でこれを送ってください』と
--     提案し、それを送ってもらって、その内容が反映できるようにしてください。
--     お詫びで補填するようにしてください」
--
-- 香取様（acc21・light_campaign・1日1件）は、材料が尽きて毎回同じ言い回しに戻り、
-- 9/20・9/21 と2日続けて投稿が1本も作れなかった。黙って翌日へ回していたため、
-- お客様からは「投稿が来ていません」というお問い合わせになっていた（9/10 に続き2度目）。
--
--   zeroPostDays     … 1本も届かなかった日が何日続いているか
--   zeroPostDate     … 最後に数えた日（JST）。連続を数えるために使う
--   materialAskedAt  … 「これを送ってください」とお願いした日時（毎日くり返さない）
--   apologyShortfall … お詫びの補填。こちらの都合で届かなかった本数をためて1日＋1件で必ず返す
--                      （Threadsに消された分＝deletedShortfall とは分けて持つ。
--                        混ぜると「スパム判定の可能性」という別の説明がお客様に伝わるため）
ALTER TABLE `threadsAccounts` ADD COLUMN `zeroPostDays` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `zeroPostDate` date NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `materialAskedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `apologyShortfall` int NOT NULL DEFAULT 0;
