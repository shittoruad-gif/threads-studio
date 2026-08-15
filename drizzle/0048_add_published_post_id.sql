-- 公開後のThreads投稿IDを予約投稿に記録する。
-- これにより「どの切り口(angle)の投稿が実際に何回見られたか」を
-- postAnalytics と突き合わせられるようになり、実績にもとづく学習ができる。
ALTER TABLE `scheduledPosts` ADD COLUMN `publishedThreadsPostId` varchar(255);
CREATE INDEX `idx_sp_published_post_id` ON `scheduledPosts` (`publishedThreadsPostId`);
