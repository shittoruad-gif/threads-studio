CREATE TABLE `aiGenerationPresets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` varchar(50) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text,
	`icon` varchar(50),
	`postType` varchar(50) NOT NULL,
	`defaultParams` text NOT NULL,
	`isSystem` boolean NOT NULL DEFAULT true,
	`displayOrder` int NOT NULL DEFAULT 0,
	`usageCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiGenerationPresets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `preset_category_idx` ON `aiGenerationPresets` (`category`);--> statement-breakpoint
CREATE INDEX `preset_display_order_idx` ON `aiGenerationPresets` (`displayOrder`);--> statement-breakpoint
CREATE INDEX `preset_usage_count_idx` ON `aiGenerationPresets` (`usageCount`);