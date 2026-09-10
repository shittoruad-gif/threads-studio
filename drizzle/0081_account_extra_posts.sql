-- 届かなかった投稿の補填（運営が期間と本数を決めて、その期間だけ1日の本数を増やす）。2026-09-10 三上様指示
-- 例：プレステージ様（9/8〜9/10に契約3件のうち6件が届かなかった）→ 9/11〜9/16 の6日間、1日＋1件＝4件
ALTER TABLE `threadsAccounts` ADD COLUMN `extraPostsPerDay` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `extraPostsUntil` date NULL;
--> statement-breakpoint
ALTER TABLE `threadsAccounts` ADD COLUMN `extraPostsReason` varchar(200) NULL;
--> statement-breakpoint
UPDATE `threadsAccounts` SET `extraPostsPerDay` = 1, `extraPostsUntil` = '2026-09-16', `extraPostsReason` = '9/8〜9/10に届かなかった6件の補填（9/11〜9/16は1日4件）' WHERE `id` = 22 AND `threadsUsername` = 'esthe_prestige_r';
--> statement-breakpoint
UPDATE `threadsAccounts` SET `extraPostsPerDay` = 1, `extraPostsUntil` = '2026-09-11', `extraPostsReason` = '9/10に届かなかった1件の補填（9/11は1日2件）' WHERE `id` = 21 AND `threadsUsername` = 'shin_honetugi';
--> statement-breakpoint
UPDATE `threadsAccounts` SET `extraPostsPerDay` = 1, `extraPostsUntil` = '2026-09-17', `extraPostsReason` = '9/9〜9/10に届かなかった6件の補填（9/12〜9/17は1日4件）' WHERE `id` = 24 AND `threadsUsername` = 'hatsukaichitenjinseitai';

