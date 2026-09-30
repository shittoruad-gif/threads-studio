-- ネタ帳（2026-09-30 三上様指示「解決できる仕組みを考えて作って」・shared/materialLedger.ts）。
-- お客様がフォームで教えてくださった話・よくある質問を1件ずつ持ち、どの投稿に使ったかを scheduledPosts.materialItemId で記録する。
-- status: active＝使う／retired＝使わない（お客様・運営が外した）
CREATE TABLE IF NOT EXISTS `materialItems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `projectId` varchar(50) NOT NULL,
  `kind` varchar(12) NOT NULL,
  `content` text NOT NULL,
  `source` varchar(12) NOT NULL DEFAULT 'form',
  `status` varchar(12) NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_mi_project` (`projectId`, `status`)
);
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `materialItemId` int NULL;
