-- リーチ強化：トピックタグ自動付与・追い投稿・コメント即応通知
ALTER TABLE `users` ADD COLUMN `autoTopicTag` boolean NOT NULL DEFAULT true;
ALTER TABLE `users` ADD COLUMN `autoFollowUpEnabled` boolean NOT NULL DEFAULT true;
ALTER TABLE `users` ADD COLUMN `lastCommentCheckAt` timestamp NULL;
ALTER TABLE `scheduledPosts` ADD COLUMN `replyToThreadsId` varchar(255) NULL;
