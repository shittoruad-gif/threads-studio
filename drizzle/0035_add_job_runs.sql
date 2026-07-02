-- バックグラウンドジョブの実行記録（デプロイ再起動によるcron欠落のキャッチアップ用）
CREATE TABLE IF NOT EXISTS `jobRuns` (
  `jobName` varchar(100) NOT NULL,
  `lastRunAt` timestamp NOT NULL,
  `lastStatus` varchar(20) NOT NULL DEFAULT 'success',
  `lastError` text NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`jobName`)
);

-- 初回デプロイ時のキャッチアップ暴発（当日分の重複実行）を防ぐシード。
-- 「今しがた実行済み」として登録し、以後は通常のcron＋記録に任せる。
INSERT IGNORE INTO `jobRuns` (`jobName`, `lastRunAt`, `lastStatus`) VALUES
  ('auto_post_generation', NOW(), 'success'),
  ('trial_reminder', NOW(), 'success'),
  ('payment_follow_up', NOW(), 'success'),
  ('weekly_report', NOW(), 'success');
