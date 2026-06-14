ALTER TABLE `scheduledPosts` ADD `source` enum('manual','auto') DEFAULT 'manual' NOT NULL;
