CREATE TABLE `aiGenerationUsage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`month` varchar(7) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiGenerationUsage_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_month_idx` UNIQUE(`userId`,`month`)
);
--> statement-breakpoint
ALTER TABLE `aiGenerationUsage` ADD CONSTRAINT `aiGenerationUsage_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;