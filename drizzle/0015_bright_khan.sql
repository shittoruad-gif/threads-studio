ALTER TABLE `aiGenerationPresets` ADD `userId` int;--> statement-breakpoint
ALTER TABLE `aiGenerationPresets` ADD CONSTRAINT `aiGenerationPresets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `preset_user_idx` ON `aiGenerationPresets` (`userId`);