CREATE TABLE `templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text,
	`category` varchar(50) NOT NULL,
	`content` text NOT NULL,
	`previewText` text,
	`tags` text,
	`usageCount` int NOT NULL DEFAULT 0,
	`isPopular` boolean NOT NULL DEFAULT false,
	`isPremium` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`templateId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userFavorites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `userFavorites` ADD CONSTRAINT `userFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userFavorites` ADD CONSTRAINT `userFavorites_templateId_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `templates`(`id`) ON DELETE cascade ON UPDATE no action;