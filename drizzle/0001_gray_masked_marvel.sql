ALTER TABLE `plans` ADD `maxAiGenerations` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` DROP COLUMN `hasAiGeneration`;