-- Meta AI呼びかけ文を7日間使っていないアカウントには送るのをやめる（設定から再開できる）。2026-09-10 三上様指示
ALTER TABLE `threadsAccounts` ADD COLUMN `metaAiCallPausedAt` timestamp NULL;
