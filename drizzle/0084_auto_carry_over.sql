-- 届かなかった分を翌日に自動で足す（2026-09-10 三上様指示）。
-- shortfall*：その日の生成で落ちた枠の数（6時の生成の最後に記録）／carry*：今日に足した数（7:40の報告に出す）
ALTER TABLE `threadsAccounts` ADD COLUMN `shortfallDate` date NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `shortfallCount` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `carryDate` date NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `carryCount` int NOT NULL DEFAULT 0;
