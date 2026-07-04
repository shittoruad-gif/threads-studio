-- 地域トレンド：地域で反応の高い投稿の参考ストック（収集/手動）
CREATE TABLE IF NOT EXISTS `regionalRefPosts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `projectId` varchar(50) NOT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'collected',
  `area` varchar(255) NULL,
  `keyword` varchar(255) NULL,
  `authorUsername` varchar(255) NULL,
  `text` text NULL,
  `permalink` text NULL,
  `postedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_regional_project` (`projectId`),
  CONSTRAINT `fk_regional_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_regional_project` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE CASCADE
);
