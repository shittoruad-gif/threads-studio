CREATE TABLE `plans` (
	`id` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`priceMonthly` int NOT NULL,
	`stripePriceId` varchar(255),
	`maxProjects` int NOT NULL DEFAULT 3,
	`maxThreadsAccounts` int NOT NULL DEFAULT 0,
	`maxScheduledPosts` int NOT NULL DEFAULT 0,
	`hasAiGeneration` boolean NOT NULL DEFAULT false,
	`hasPrioritySupport` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(50) NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`templateId` varchar(100),
	`inputs` text,
	`posts` text,
	`tags` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduledPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`projectId` varchar(50) NOT NULL,
	`threadsAccountId` int NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`status` enum('pending','processing','posted','failed','canceled') NOT NULL DEFAULT 'pending',
	`postedAt` timestamp,
	`errorMessage` text,
	`postContent` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduledPosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`planId` varchar(50) NOT NULL,
	`stripeSubscriptionId` varchar(255),
	`status` enum('trialing','active','canceled','past_due','unpaid','incomplete') NOT NULL DEFAULT 'trialing',
	`trialEndsAt` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threadsAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`threadsUserId` varchar(255) NOT NULL,
	`threadsUsername` varchar(255),
	`accessToken` text NOT NULL,
	`tokenExpiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threadsAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `stripeCustomerId` varchar(255);--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_threadsAccountId_threadsAccounts_id_fk` FOREIGN KEY (`threadsAccountId`) REFERENCES `threadsAccounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD CONSTRAINT `threadsAccounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;