-- フォロワー日次スナップショット（成果の見える化）
CREATE TABLE IF NOT EXISTS `followerSnapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `threadsAccountId` int NOT NULL,
  `followersCount` int NOT NULL DEFAULT 0,
  `capturedOn` varchar(10) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_snapshot_account_day` (`threadsAccountId`, `capturedOn`),
  KEY `idx_snapshot_user` (`userId`),
  CONSTRAINT `fk_snapshot_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_snapshot_account` FOREIGN KEY (`threadsAccountId`) REFERENCES `threadsAccounts`(`id`) ON DELETE CASCADE
);

-- 伸びた投稿の全ユーザー横断アーカイブ（プロダクト改善用・管理者のみ閲覧）
CREATE TABLE IF NOT EXISTS `hitPostArchive` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `threadsPostId` varchar(255) NOT NULL,
  `businessType` varchar(255) NULL,
  `postContent` text NULL,
  `impressions` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `replies` int NOT NULL DEFAULT 0,
  `reposts` int NOT NULL DEFAULT 0,
  `engagement` int NOT NULL DEFAULT 0,
  `postedAt` timestamp NULL,
  `archivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_hit_post` (`threadsPostId`),
  KEY `idx_hit_business` (`businessType`),
  CONSTRAINT `fk_hit_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

-- 解約時アンケート
CREATE TABLE IF NOT EXISTS `cancellationFeedback` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `planId` varchar(50) NULL,
  `reason` varchar(50) NOT NULL,
  `detail` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_cancelfb_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
