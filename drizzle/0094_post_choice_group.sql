-- 2026-09-22 三上様指示「2日連続で公開に至らなかったクライアントには3案を提示し、
-- 好きなものを選んでもらう形に」。
--
-- 3案は「1件の枠に対する選択肢」であって、3件公開するわけではない。
-- 同じ枠から出た案だと分かる印を持たせ、次の2つに使う。
--   ・1案が選ばれたら、残りを即 canceled にする（重ねて公開しない）
--   ・1日の本数を数えるとき、3案を1件として数える（契約超過に見せない）
--
-- ★印が無い投稿（NULL）は今までどおり1件ずつの扱い。既存の投稿は何も変わらない。
ALTER TABLE `scheduledPosts` ADD COLUMN `choiceGroupId` varchar(40) NULL;
--> statement-breakpoint
CREATE INDEX `idx_scheduledPosts_choiceGroup` ON `scheduledPosts` (`choiceGroupId`);
