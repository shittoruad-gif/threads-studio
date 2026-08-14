-- 自動投稿の「切り口」多様化＋クライアント◯✕フィードバック学習
-- angle: この投稿で使った切り口ID（shared/postAngles.ts）
-- clientRating: クライアントの評価（good=◯ いい / bad=✕ 違う）。切り口の重み付けに使う
ALTER TABLE `scheduledPosts` ADD COLUMN `angle` varchar(50) NULL;
ALTER TABLE `scheduledPosts` ADD COLUMN `clientRating` enum('good','bad') NULL;
ALTER TABLE `scheduledPosts` ADD COLUMN `ratedAt` timestamp NULL;
CREATE INDEX `idx_scheduledPosts_rating` ON `scheduledPosts` (`userId`, `clientRating`);
