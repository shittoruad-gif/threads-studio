-- 代理店解約時のクライアント引き継ぎ: 猶予開始日時
ALTER TABLE `users` ADD COLUMN `takeoverPendingAt` timestamp NULL;
