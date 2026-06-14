ALTER TABLE `threadsAccounts` ADD `defaultProjectId` varchar(50);
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD CONSTRAINT `threadsAccounts_defaultProjectId_projects_id_fk` FOREIGN KEY (`defaultProjectId`) REFERENCES `projects`(`id`) ON DELETE set null ON UPDATE no action;
