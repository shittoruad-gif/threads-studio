-- 2026-09-19 三上様ご判断：
--   「投稿が1回消されたぐらいで冷却する必要は本当にあるの？」
--
-- 健全性点検は「投稿がThreads上から見つからない」ことしか見ておらず、
-- ご本人が消したのか Meta が消したのかを区別できない。
-- 9/12 に冷却の仕組みを入れてからの5回のうち3回は「1件だけ」で、
-- そのあと実際にMetaから制限を受けたアカウントは0件だった。
--
-- そこで、1件だけ消えたときは冷却に入れず、まずLINEでご本人に伺う。
--   ・「自分で消した」→ 冷却なし・補填なし（singleDeleteAskedAt を消す）
--   ・「消していない」→ その場で7日間の冷却へ
--   ・7日以内に2件目が消えた／同時に2件以上消えた → 今までどおり即冷却
ALTER TABLE `threadsAccounts` ADD COLUMN `singleDeleteAskedAt` timestamp NULL;
--> statement-breakpoint
-- 伺った1件の投稿ID（お返事が「消していない」のときに、この1件を補填へ積む）
ALTER TABLE `threadsAccounts` ADD COLUMN `singleDeletePostId` varchar(64) NULL;
