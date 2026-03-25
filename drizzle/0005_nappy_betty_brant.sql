CREATE TABLE `aiGenerationTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`postType` varchar(50) NOT NULL,
	`generationParams` text NOT NULL,
	`isPublic` boolean NOT NULL DEFAULT false,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiGenerationTemplates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `aiGenerationTemplates` ADD CONSTRAINT `aiGenerationTemplates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `template_user_id_idx` ON `aiGenerationTemplates` (`userId`);--> statement-breakpoint
CREATE INDEX `template_usage_count_idx` ON `aiGenerationTemplates` (`usageCount`);