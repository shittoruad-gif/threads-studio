-- 商圏（最寄り駅・徒歩分数）をユーザーが確認した日時。
-- null = アプリが自動で推定しただけで、まだ本人の承認を得ていない状態。
-- 未承認の商圏は投稿文に使わない（概算値が広告表示に出てしまうのを防ぐ）。
ALTER TABLE `projects` ADD COLUMN `localTermsConfirmedAt` timestamp NULL;
