-- 決済失敗フォローアップ（dunning）用カラム
ALTER TABLE `subscriptions` ADD COLUMN `failedPaymentCount` int NOT NULL DEFAULT 0;
ALTER TABLE `subscriptions` ADD COLUMN `firstFailedPaymentAt` timestamp NULL;
ALTER TABLE `subscriptions` ADD COLUMN `lastFailedPaymentAt` timestamp NULL;
ALTER TABLE `subscriptions` ADD COLUMN `lastDunningReminderAt` timestamp NULL;
