-- 2026-09-22 夜間整備
--
-- 夜間整備の手順 §3.45 は「その日に作り直しで落ちた理由をログで数える」ことになっているが、
-- 本番のログは再デプロイのたびに消える。9/22 未明の整備では 6時の生成のログが
-- 09:52 の再デプロイですでに消えており、1件も数えられなかった
-- （docs/night-todo.md「忘れると事故になること」＝「数えたい検査はDBに印を残す形にする」）。
--
-- 「同じ理由で3回落ちて投稿ゼロになった人がいないか」は、その日の投稿がお客様に届くかに
-- 直結する。ログに頼らず数えられるよう、落ちた理由をここに残す。
CREATE TABLE `postRejectLog` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `threadsAccountId` int NOT NULL,
  `guard` varchar(40) NOT NULL,
  `detail` varchar(255),
  `gaveUp` tinyint NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `postRejectLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_postRejectLog_created` ON `postRejectLog` (`createdAt`);
--> statement-breakpoint
CREATE INDEX `idx_postRejectLog_account` ON `postRejectLog` (`threadsAccountId`,`createdAt`);
