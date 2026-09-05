-- 「Meta AIに聞く」返信（2026-09-05 三上様指示）。
-- 投稿の公開直後に、自分の投稿へ「@meta.ai ＋一般的な質問」を1件返信し、
-- Meta AIの公開回答でスレッドに会話を作る。既定はOFF（お客様が選んでON）。
ALTER TABLE `users` ADD COLUMN `metaAiAskEnabled` boolean NOT NULL DEFAULT false;
-- 公開後に返信する「@meta.ai …」の文。無い投稿は返信しない。
ALTER TABLE `scheduledPosts` ADD COLUMN `metaAiAskText` text NULL;
