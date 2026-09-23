-- 2026-09-24 三上様指示「ユーザーが何度も却下をしているところは、徹底的にフォローする」。
-- 直近7日に3回以上見送られたお客様について、ホームページから「まだ登録にない材料」を拾い、
-- 三上様がLINEで「足す」を押したものだけ、お店の情報に足す（消さない・書き換えない）。
--   status    … pending（三上様の判断待ち）／applied（足した）／skipped（見送り）／undone（元に戻した）／no_url（ホームページ未登録）
--   proposal  … 足す候補（shared/declineFollowup.ts の MaterialProposal）
--   beforeSnapshot … 足す前のお店の情報（「元に戻す」で書き戻す）
CREATE TABLE IF NOT EXISTS `materialProposals` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `projectId` varchar(50) NOT NULL,
  `threadsAccountId` int NOT NULL,
  `sourceUrl` varchar(500) NULL,
  `proposal` text NULL,
  `beforeSnapshot` mediumtext NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `declines` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` timestamp NULL,
  `decidedBy` int NULL
);
--> statement-breakpoint
CREATE INDEX `idx_materialProposals_project` ON `materialProposals` (`projectId`, `createdAt`);
