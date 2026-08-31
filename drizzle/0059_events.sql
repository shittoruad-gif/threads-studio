-- イベント告知（開催日から逆算した告知投稿）
CREATE TABLE `events` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `projectId` varchar(50) NULL,
  `threadsAccountId` int NOT NULL,
  `title` varchar(120) NOT NULL,
  `eventDate` varchar(10) NOT NULL,
  `eventTime` varchar(40) NULL,
  `venue` varchar(200) NULL,
  `description` text NULL,
  `offer` varchar(300) NULL,
  `status` enum('active','canceled') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_events_userId` (`userId`)
);
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `eventId` int NULL;
