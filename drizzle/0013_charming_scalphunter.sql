ALTER TABLE `threadsAccounts` ADD `followersCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD `followingCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD `lastSyncedAt` timestamp;