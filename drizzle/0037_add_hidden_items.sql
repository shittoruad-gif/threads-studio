-- ユーザーが非表示にした共有アイテム（初期プリセット・デザインテンプレート集）
CREATE TABLE IF NOT EXISTS `hiddenItems` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `itemType` varchar(20) NOT NULL,
  `itemKey` varchar(100) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_hidden_user_item` (`userId`, `itemType`, `itemKey`),
  KEY `idx_hidden_user` (`userId`),
  CONSTRAINT `fk_hidden_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
