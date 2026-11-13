-- 1か所だけ変えた投稿の比べ（2026-11-13・shared/oneSpotVariant.ts）。元の投稿と、変えた前後の言葉を残す
CREATE TABLE IF NOT EXISTS `oneSpotVariants` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `threadsAccountId` int NOT NULL,
  `sourceThreadsPostId` varchar(255) NOT NULL,
  `sourceImpressions` int NOT NULL DEFAULT 0,
  `spot` varchar(20) NOT NULL,
  `changedFrom` varchar(120) NOT NULL,
  `changedTo` varchar(120) NOT NULL,
  `variantText` text NOT NULL,
  `scheduledPostId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `one_spot_account_idx` (`threadsAccountId`, `createdAt`),
  KEY `one_spot_source_idx` (`sourceThreadsPostId`)
);
