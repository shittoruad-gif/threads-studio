-- 2026-09-28 三上様指示「伸びた投稿は、他のクライアントの伸びた投稿も含めてブラッシュアップ」「一度ムーブアクトの店舗で試して、1日5投稿になってもいい」。
--   hitPatterns … クライアント全体の「その店の普段の2倍以上読まれた投稿」から取り出した型（本文・店名・数字は持たない）
--     group     … 業種のまとまり（health／beauty／recruit／other）。同じまとまりの型だけを使う
--     status    … active（使う）／rejected（検査に落ちた・使わない）
--   scheduledPosts.hitPatternId … どの型で作った投稿か（型ごとの効果を測るため）
CREATE TABLE IF NOT EXISTS `hitPatterns` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `sourceThreadsPostId` varchar(255) NOT NULL,
  `sourceAccountId` int NOT NULL,
  `businessGroup` varchar(20) NOT NULL,
  `impressions` int NOT NULL DEFAULT 0,
  `ratio` int NOT NULL DEFAULT 0,
  `pattern` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `note` varchar(255) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_hitPatterns_source` ON `hitPatterns` (`sourceThreadsPostId`);
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `hitPatternId` int NULL;
