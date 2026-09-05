-- 「Meta AIに聞く」返信を既定ONに（2026-09-06 三上様指示：Meta AIの返信でリーチを広げる作戦を全員に）。
-- 止めたい方は設定からOFFにできる。
ALTER TABLE `users` MODIFY COLUMN `metaAiAskEnabled` boolean NOT NULL DEFAULT true;--> statement-breakpoint
UPDATE `users` SET `metaAiAskEnabled` = true;
