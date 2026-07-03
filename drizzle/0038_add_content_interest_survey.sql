-- 契約時「興味のあるコンテンツ」アンケート
CREATE TABLE IF NOT EXISTS `contentInterestSurvey` (
  `userId` int NOT NULL,
  `interests` text NULL,
  `freeText` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `fk_cis_user` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
