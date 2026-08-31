-- 個人ブランディングモード（projects.mode: store/personal）
ALTER TABLE `projects` ADD COLUMN `mode` varchar(10) NOT NULL DEFAULT 'store';
