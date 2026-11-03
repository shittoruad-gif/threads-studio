-- アカウントごとに決めておく自動投稿の時刻（2026-11-04・shared/fixedPostHours.ts）。
-- カンマ区切りの時（JST・0〜23・昇順・最大5件）。例 "12,15"。NULL＝今まで通り（過去の反応・既定の時間帯で決める）。
ALTER TABLE `threadsAccounts` ADD COLUMN `fixedPostHours` varchar(20) NULL;
