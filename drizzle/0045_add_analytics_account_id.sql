-- アカウント切替でデータを絞れるように、postAnalyticsへ連携アカウントIDを追加。
-- 既存行のバックフィル: アカウントを1つしか連携していないユーザーの行は
-- そのアカウントに確定できるので埋める。複数アカウントのユーザーの既存行は
-- 帰属を特定できないためNULLのまま（以後の日次取得で正しい値が入る）。
ALTER TABLE `postAnalytics` ADD COLUMN `threadsAccountId` int NULL;
CREATE INDEX `idx_postAnalytics_account` ON `postAnalytics` (`threadsAccountId`);
UPDATE `postAnalytics` pa
JOIN (
  SELECT `userId`, MIN(`id`) AS accId
  FROM `threadsAccounts`
  GROUP BY `userId`
  HAVING COUNT(*) = 1
) t ON pa.`userId` = t.`userId`
SET pa.`threadsAccountId` = t.accId
WHERE pa.`threadsAccountId` IS NULL;
