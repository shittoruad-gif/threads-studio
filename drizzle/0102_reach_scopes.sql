-- 場所のタグ付け・Instagramストーリーズへの同時シェア（2026-09-28・Meta審査の申請に合わせて）
ALTER TABLE `threadsAccounts` ADD COLUMN `grantedExtraScopes` varchar(255) NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `locationId` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `locationName` varchar(200) NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `shareToIgStories` boolean NULL;
