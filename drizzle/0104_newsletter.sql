-- 有料会員向けの読み物（週1回）（2026-09-29 三上様指示・shared/newsletter.ts）。
-- 回ごとの状態：pending＝三上様の判断待ち／sending＝送信中／sent＝送信ずみ／skipped＝この回は送らない
CREATE TABLE IF NOT EXISTS `newsletterIssues` (
  `issueNo` int PRIMARY KEY,
  `status` varchar(12) NOT NULL,
  `previewedAt` timestamp NULL,
  `decidedAt` timestamp NULL,
  `decidedBy` int NULL,
  `recipients` int NULL
);
--> statement-breakpoint
-- お一人ずつの配信記録。同じ回が同じ方へ2回届かないよう (issueNo, userId) を一意にする
CREATE TABLE IF NOT EXISTS `newsletterDeliveries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `issueNo` int NOT NULL,
  `userId` int NOT NULL,
  `channel` varchar(8) NOT NULL,
  `ok` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_newsletter_issue_user` (`issueNo`, `userId`)
);
--> statement-breakpoint
-- 「読み物は不要」とおっしゃった方（担当者が入れる）。ここにある方には送らない
CREATE TABLE IF NOT EXISTS `newsletterOptOuts` (
  `userId` int PRIMARY KEY,
  `note` varchar(200) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
