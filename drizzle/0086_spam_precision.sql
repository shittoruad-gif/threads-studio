-- スパム判定を減らす（2026-09-12 三上様指示・しっとる公式の投稿が「大量のアクション」で削除された件）
-- ① 追い投稿（自己返信）を既定OFFにし、全員OFFへ。② 投稿が消されたアカウントは7日間1日1件に落とす（cooldownUntil）
ALTER TABLE `users` MODIFY COLUMN `autoFollowUpEnabled` tinyint(1) NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `users` SET `autoFollowUpEnabled` = 0;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `cooldownUntil` date NULL;
--> statement-breakpoint
UPDATE `threadsAccounts` SET `cooldownUntil` = '2026-09-19' WHERE `id` = 14 AND `threadsUsername` = 'shittoru_official';
