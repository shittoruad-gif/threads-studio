CREATE TABLE `postAnalytics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`threadsPostId` varchar(255) NOT NULL,
	`postContent` text,
	`postPermalink` text,
	`postedAt` timestamp,
	`impressions` int NOT NULL DEFAULT 0,
	`likes` int NOT NULL DEFAULT 0,
	`replies` int NOT NULL DEFAULT 0,
	`reposts` int NOT NULL DEFAULT 0,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postAnalytics_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_analytics_user_post_idx` UNIQUE(`userId`,`threadsPostId`)
);
--> statement-breakpoint
CREATE TABLE `userHistoryFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`historyId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userHistoryFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_history_favorite_idx` UNIQUE(`userId`,`historyId`)
);
--> statement-breakpoint
ALTER TABLE `coupons` MODIFY COLUMN `type` enum('forever_free','trial_30','trial_14','discount_50','discount_30','special_price') NOT NULL;--> statement-breakpoint
ALTER TABLE `postAnalytics` ADD CONSTRAINT `postAnalytics_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userHistoryFavorites` ADD CONSTRAINT `userHistoryFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userHistoryFavorites` ADD CONSTRAINT `userHistoryFavorites_historyId_aiGenerationHistory_id_fk` FOREIGN KEY (`historyId`) REFERENCES `aiGenerationHistory`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `post_analytics_user_id_idx` ON `postAnalytics` (`userId`);--> statement-breakpoint
CREATE INDEX `post_analytics_threads_post_id_idx` ON `postAnalytics` (`threadsPostId`);--> statement-breakpoint
CREATE INDEX `idx_sp_status_scheduledAt` ON `scheduledPosts` (`status`,`scheduledAt`);--> statement-breakpoint
CREATE INDEX `idx_sp_userId` ON `scheduledPosts` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_sub_userId` ON `subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_sub_status` ON `subscriptions` (`status`);