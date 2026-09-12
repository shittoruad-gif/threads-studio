-- 「見送りを押さなければ予定時刻に公開する」（承認を押せない忙しい先生向け。2026-09-12 三上様指示・岩根様の件）
ALTER TABLE `users` ADD COLUMN `autoPublishIfNoResponse` tinyint(1) NOT NULL DEFAULT 0;
