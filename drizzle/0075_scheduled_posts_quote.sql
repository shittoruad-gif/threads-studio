-- 引用投稿（固定投稿の再露出）。scheduledPosts.quotePostId に引用元の投稿IDを持つ
ALTER TABLE `scheduledPosts` ADD COLUMN `quotePostId` varchar(64) NULL;
