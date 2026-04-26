-- Add `links` JSON-text column to projects so users can register multiple
-- URLs (LINE, Web reservation, homepage, etc.) once and reuse them across
-- pinned posts and auto-generated posts.
ALTER TABLE `projects` ADD COLUMN `links` text;
