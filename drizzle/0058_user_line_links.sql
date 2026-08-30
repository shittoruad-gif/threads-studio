-- LINE連携を1対1から多対1へ（1アカウントに複数のLINE）
CREATE TABLE `userLineLinks` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `lineUserId` varchar(64) NOT NULL,
  `displayName` varchar(120) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `userLineLinks_lineUserId_unique` (`lineUserId`),
  KEY `idx_userLineLinks_userId` (`userId`)
);
--> statement-breakpoint
INSERT IGNORE INTO `userLineLinks` (`userId`, `lineUserId`)
  SELECT `id`, `lineUserId` FROM `users` WHERE `lineUserId` IS NOT NULL;
