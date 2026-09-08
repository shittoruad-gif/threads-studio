-- 業種と登録内容のズレの通知を、同じ内容で何度も送らない（2026-09-08 三上様「ひたすら来ています」）。
-- 直近に通知したズレの内容の指紋を持ち、変わったときだけ運営に知らせる。
ALTER TABLE `projects` ADD COLUMN `industryMismatchNoticeKey` varchar(64) NULL;
