-- 固定投稿ウィザードのお知らせバナーを「確認済み」にした日時。
-- null のあいだだけホーム画面にバナーを出す。
-- （schema.ts には既に定義されていたがマイグレーションが無く、本番に列が無い状態だった）
ALTER TABLE `users` ADD COLUMN `wizardNotificationSeenAt` timestamp NULL;
