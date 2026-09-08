-- お客様がご自分で直した投稿の「直す前」を残す。
-- これまでは postContent を上書きしていたので、何をどう直されたのかが残らず、
-- 翌日以降の投稿に活かせなかった（毎日同じ調子の投稿が届いていた）。
ALTER TABLE `scheduledPosts` ADD COLUMN `originalContent` text NULL;
--> statement-breakpoint
ALTER TABLE `scheduledPosts` ADD COLUMN `editedByUserAt` timestamp NULL;
