CREATE TABLE `monitorFeedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`page` varchar(100) NOT NULL,
	`category` enum('bug','usability','feature_request','other') NOT NULL DEFAULT 'other',
	`content` text NOT NULL,
	`screenshotUrl` text,
	`adminNote` text,
	`status` enum('new','in_progress','resolved','wont_fix') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monitorFeedback_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `coupons` MODIFY COLUMN `type` enum('forever_free','trial_30','trial_14','discount_50','discount_30','special_price','monitor') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `isMonitor` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `monitorFeedback` ADD CONSTRAINT `monitorFeedback_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `monitor_feedback_user_id_idx` ON `monitorFeedback` (`userId`);--> statement-breakpoint
CREATE INDEX `monitor_feedback_status_idx` ON `monitorFeedback` (`status`);