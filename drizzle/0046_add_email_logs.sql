-- 送信メールログ（管理画面「契約・メール」で顧客に送られたメールを確認できるように）
CREATE TABLE `email_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `toEmail` varchar(320) NOT NULL,
  `subject` varchar(500) NOT NULL,
  `body` text,
  `status` enum('sent','failed','skipped') NOT NULL,
  `error` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_logs_to_email_idx` (`toEmail`),
  KEY `email_logs_created_at_idx` (`createdAt`)
);
