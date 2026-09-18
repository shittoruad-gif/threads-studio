-- 2026-09-18 三上様指示：
--   ①「追記のお願い」を入れ、追記が少ないと投稿がどうしても似てくることをお客様に分かるようにする
--   ② プロプランは必ず1日3件お届けする（重複で書き直し切れた枠を捨てない）
--
-- ①のために「その日、同じ言い回しへ戻って書き直した回数」を残す。
-- 岩根様（account 25）は 9/18 に16回書き直して1件届かなかったが、
-- この事実がログにしか無く、お客様には「今日は1件少ない」としか見えていなかった。
ALTER TABLE `threadsAccounts` ADD COLUMN `dupRejectDate` date NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `dupRejectCount` int NOT NULL DEFAULT 0;
--> statement-breakpoint
-- ②の保証パスで作った投稿（材料が尽きたため、似ていても枠を捨てずにお届けした分）の印。
-- 自動公開はせず必ず承認カードにするので、お客様が見送れる。
ALTER TABLE `scheduledPosts` ADD COLUMN `materialGuarantee` tinyint(1) NOT NULL DEFAULT 0;
