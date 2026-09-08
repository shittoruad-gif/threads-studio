-- 新規のお客様の最初の3本は、お客様へ承認カードを送る前に運営が目を通す（2026-09-08 三上様指示）。
-- adminReviewRequired=1 かつ adminReviewAt が空のあいだは、承認されても公開しない。
ALTER TABLE `scheduledPosts` ADD COLUMN `adminReviewRequired` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `adminReviewAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `adminReviewBy` varchar(120) NULL;
