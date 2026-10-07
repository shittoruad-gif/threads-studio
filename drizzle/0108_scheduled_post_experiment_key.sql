-- 学習用アカウント（自社の Moveact 2店）の「1つの条件だけ変えた投稿」の条件（2026-10-07 三上様「リーチが取れる投稿の傾向を早く」）。
ALTER TABLE `scheduledPosts` ADD COLUMN `experimentKey` varchar(40) NULL;
