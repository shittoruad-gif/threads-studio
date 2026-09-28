-- Threads の機能の投稿（2026-09-28・shared/threadsFeatures.ts）：アンケートの選択肢（JSON配列）
ALTER TABLE `scheduledPosts` ADD COLUMN `pollOptions` text NULL;
