-- 毎日5分の「交流」の案内（2026-10-20・shared/engagementCoach.ts）。会員ごとに、受け取るか・最後に送った日・「やった」が続けて無い回数・何番目まで進んだか
ALTER TABLE `users` ADD COLUMN `engagementCoachEnabled` tinyint NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `engagementCoachLastAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `engagementCoachMiss` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `engagementCoachStep` int NOT NULL DEFAULT 0;
