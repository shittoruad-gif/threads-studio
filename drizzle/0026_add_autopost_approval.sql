ALTER TABLE `users` ADD `autoPostRequireApproval` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` MODIFY COLUMN `status` enum('pending','processing','posted','failed','canceled','awaiting_approval') NOT NULL DEFAULT 'pending';
