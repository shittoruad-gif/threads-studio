-- 「次にやること」の公式LINE通知。
--
-- 設定が途中で止まっていることにご本人が気づけず、
-- 「投稿が来ない」「別のアカウントに同じ内容が出る」状態のまま使われてしまうため、
-- 状態を見て次の一手をお伝えする。毎日同じ案内を送らないよう、送った内容と日時を記録する。
ALTER TABLE `users` ADD COLUMN `nextActionNotifyEnabled` tinyint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `nextActionLastKey` varchar(40) NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `nextActionLastSentAt` timestamp NULL;
