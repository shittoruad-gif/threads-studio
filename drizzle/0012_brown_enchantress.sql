CREATE TABLE `creditTransactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`amount` int NOT NULL,
	`type` enum('referral_bonus','referred_bonus','purchase','usage','referral_reward') NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `creditTransactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `referrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`referredUserId` int NOT NULL,
	`referrerReward` int NOT NULL DEFAULT 0,
	`referredReward` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `referrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `creditTransactions` ADD CONSTRAINT `creditTransactions_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referrerId_users_id_fk` FOREIGN KEY (`referrerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referredUserId_users_id_fk` FOREIGN KEY (`referredUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `credit_transaction_user_id_idx` ON `creditTransactions` (`userId`);--> statement-breakpoint
CREATE INDEX `referral_referrer_id_idx` ON `referrals` (`referrerId`);--> statement-breakpoint
CREATE INDEX `referral_referred_user_id_idx` ON `referrals` (`referredUserId`);