-- 「できるようになったこと」の週1回のお知らせ（2026-11-02 三上様・shared/featureUpdates.ts）。
-- 項目ごとの状態：pending＝三上様の判断待ち（batchKey の下見に入っている）／held＝「今週は送らない」（来週の下見に持ち越す）
--   ／sending＝送信中／sent＝送信ずみ／dropped＝「この項目は出さない」
CREATE TABLE IF NOT EXISTS `featureUpdateItems` (
  `itemId` varchar(64) PRIMARY KEY,
  `status` varchar(12) NOT NULL,
  `batchKey` varchar(20) NULL,
  `previewedAt` timestamp NULL,
  `decidedAt` timestamp NULL,
  `decidedBy` int NULL
);
--> statement-breakpoint
-- お一人ずつの配信記録。同じ項目が同じ方へ2回届かないよう (itemId, userId) を一意にする
CREATE TABLE IF NOT EXISTS `featureUpdateDeliveries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `itemId` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `batchKey` varchar(20) NOT NULL,
  `channel` varchar(8) NOT NULL,
  `ok` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_feature_update_item_user` (`itemId`, `userId`)
);
