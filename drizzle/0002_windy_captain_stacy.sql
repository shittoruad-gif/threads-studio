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
CREATE TABLE `userCoupons` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`couponId` int NOT NULL,
	`appliedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `userCoupons_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `userCoupons` ADD CONSTRAINT `userCoupons_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userCoupons` ADD CONSTRAINT `userCoupons_couponId_coupons_id_fk` FOREIGN KEY (`couponId`) REFERENCES `coupons`(`id`) ON DELETE cascade ON UPDATE no action;