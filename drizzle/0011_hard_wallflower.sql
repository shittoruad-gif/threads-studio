ALTER TABLE `users` ADD `referralCode` varchar(16);--> statement-breakpoint
ALTER TABLE `users` ADD `credits` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_referralCode_unique` UNIQUE(`referralCode`);