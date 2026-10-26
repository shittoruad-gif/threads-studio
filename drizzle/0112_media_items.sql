-- 写真・動画の自動投稿（2026-10-26 三上様「画像や動画を使った自動投稿」・プロプラン以上のみ。動画はマカセルのプロとThreads Studioのプロの両方の方）
CREATE TABLE IF NOT EXISTS `mediaItems` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `token` varchar(40) NOT NULL,
  `kind` varchar(10) NOT NULL,
  `mime` varchar(40) NOT NULL,
  `data` mediumblob NULL,
  `externalUrl` text NULL,
  `description` text NULL,
  `source` varchar(20) NOT NULL,
  `sourceRef` varchar(120) NULL,
  `enabled` tinyint NOT NULL DEFAULT 1,
  `usedCount` int NOT NULL DEFAULT 0,
  `lastUsedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `mediaItems_id` PRIMARY KEY(`id`),
  CONSTRAINT `mediaItems_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE INDEX `idx_mediaItems_user` ON `mediaItems` (`userId`);
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `mediaItemId` int NULL;
