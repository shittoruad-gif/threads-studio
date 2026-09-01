-- 「Threads側でピン留めした」というご本人の確認。
--
-- 固定投稿は、Threadsのプロフィール最上部に固定してはじめて集客の入口になるが、
-- ピン留めは Threads の API では操作も確認もできない（提供されていない）。
-- そのため、ご本人が「ピン留めしました」と申告した時刻を持つ。
ALTER TABLE `users` ADD COLUMN `pinnedPostConfirmedAt` timestamp NULL;
