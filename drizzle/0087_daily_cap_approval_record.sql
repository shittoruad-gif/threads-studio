-- 2026-09-13 三上様決定：承認の記録（R7）・消された投稿の補填（R6）・9/13 お知らせを日中に手動送付した2名の記録（R3）
ALTER TABLE `scheduledPosts` ADD COLUMN `approvedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `approvedVia` varchar(20) NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `deletedShortfall` int NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `users` SET `lastAnnouncementKey` = 'publish_unless_declined_2026-09-13' WHERE `id` IN (5443, 3200);
