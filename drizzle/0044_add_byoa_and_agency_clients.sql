-- BYOA（利用者自身のMetaアプリでThreads連携）と、代理店のクライアントID発行
ALTER TABLE `users` ADD COLUMN `threadsAppId` varchar(64) NULL;
ALTER TABLE `users` ADD COLUMN `threadsAppSecretEnc` text NULL;
ALTER TABLE `users` ADD COLUMN `parentAgencyUserId` int NULL;
CREATE INDEX `idx_users_parent_agency` ON `users` (`parentAgencyUserId`);
