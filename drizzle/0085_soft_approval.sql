-- 「見送りを押さなければ予定時刻に公開する」を全員の既定にする（2026-09-12 三上様指示・岩根様のように承認を押せない方が出ないように）
ALTER TABLE `users` ADD COLUMN `autoPublishIfNoResponse` tinyint(1) NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE `users` SET `autoPublishIfNoResponse` = 1;
