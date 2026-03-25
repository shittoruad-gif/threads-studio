CREATE TABLE `coupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(50) NOT NULL,
	`type` enum('forever_free','trial_30','trial_14') NOT NULL,
	`description` text,
	`maxUses` int,
	`usedCount` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `coupons_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
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
	`businessType` varchar(100),
	`area` varchar(100),
	`target` text,
	`mainProblem` text,
	`strength` text,
	`proof` text,
	`ctaLink` text,
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
	`univapaySubscriptionId` varchar(255),
	`status` enum('trialing','active','canceled','past_due','unpaid','incomplete') NOT NULL DEFAULT 'trialing',
	`trialEndsAt` timestamp,
	`currentPeriodEnd` timestamp,
	`cancelAtPeriodEnd` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
CREATE TABLE `threadsAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`threadsUserId` varchar(255) NOT NULL,
	`threadsUsername` varchar(255),
	`profilePictureUrl` text,
	`biography` text,
	`accessToken` text NOT NULL,
	`tokenExpiresAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threadsAccounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userCoupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`couponId` int NOT NULL,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userCoupons_id` PRIMARY KEY(`id`)
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
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`stripeCustomerId` varchar(255),
	`onboardingCompleted` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD CONSTRAINT `scheduledPosts_threadsAccountId_threadsAccounts_id_fk` FOREIGN KEY (`threadsAccountId`) REFERENCES `threadsAccounts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_plans_id_fk` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD CONSTRAINT `threadsAccounts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userCoupons` ADD CONSTRAINT `userCoupons_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userCoupons` ADD CONSTRAINT `userCoupons_couponId_coupons_id_fk` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userFavorites` ADD CONSTRAINT `userFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userFavorites` ADD CONSTRAINT `userFavorites_templateId_templates_id_fk` FOREIGN KEY (`templateId`) REFERENCES `templates`(`id`) ON DELETE cascade ON UPDATE no action;