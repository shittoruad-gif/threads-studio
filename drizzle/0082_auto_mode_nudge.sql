-- 「自動（確認なし）にしませんか」のお声がけの記録（2026-09-10 三上様指示）
ALTER TABLE `users` ADD COLUMN `autoModeNudgeAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `autoModeNudgeCount` int NOT NULL DEFAULT 0;
