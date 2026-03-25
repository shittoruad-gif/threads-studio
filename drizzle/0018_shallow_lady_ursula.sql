ALTER TABLE `users` ADD `autoPostEnabled` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `autoPostFrequency` enum('daily','twice_daily','three_daily') DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastAutoPostTypeIndex` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `lastAutoPurposeIndex` int DEFAULT 0 NOT NULL;