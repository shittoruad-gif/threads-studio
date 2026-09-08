-- 8:30の案内と一緒に送る「その日のお知らせ」を、1人に1回だけ送るための記録（2026-09-09 三上様指示）。
ALTER TABLE `users` ADD COLUMN `lastAnnouncementKey` varchar(64) NULL;
