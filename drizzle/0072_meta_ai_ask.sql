-- 「Meta AIに聞く」返信（2026-09-05 三上様指示）。
-- 投稿の公開直後に、自分の投稿へ「@meta.ai ＋一般的な質問」を1件返信し、
-- Meta AIの公開回答でスレッドに会話を作る。既定はOFF（お客様が選んでON）。
-- ★文の区切りは必ず `--> statement-breakpoint`。起動時の適用処理はこれでしか分割しない
--   （2026-09-05: `;` 区切りで2文書いたため1文として実行され失敗→適用済み扱いになり、
--   本番でログイン不能になった）。
ALTER TABLE `users` ADD COLUMN `metaAiAskEnabled` boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `metaAiAskText` text NULL;
