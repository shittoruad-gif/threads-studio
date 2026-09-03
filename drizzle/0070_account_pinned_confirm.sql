-- 固定投稿の「ピン留めしました」をアカウント単位で持つ。
-- 複数アカウント運用では、片方のアカウントでピン留めしても、もう片方は未対応のまま。
-- ユーザー単位（users.pinnedPostConfirmedAt）だけだと、2つ目のアカウントの抜けが見えなかった。
ALTER TABLE `threadsAccounts` ADD COLUMN `pinnedPostConfirmedAt` timestamp NULL;
