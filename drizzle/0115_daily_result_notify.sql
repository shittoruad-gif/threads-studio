-- 朝のまとめの「昨日の投稿結果」を受け取るか（2026-11-04 お客様のご希望「投稿結果を送らないで欲しい」）。0＝出さない。お知らせ・承認待ちの件数はそのまま。
ALTER TABLE `users` ADD COLUMN `dailyResultNotifyEnabled` tinyint NOT NULL DEFAULT 1;
