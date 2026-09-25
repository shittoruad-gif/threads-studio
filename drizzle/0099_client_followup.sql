-- 2026-09-25 三上様指示「クライアントが数日間動いていなければ、そこに対してフォローできるような仕組みも作って」。
--   userLineLinks.lastActiveAt … そのLINEから最後にボタン・文章が届いた時刻（1時間に1回だけ更新）
--   clientStallState … お客様ごとに「いま止まっている工程」と、いつからその工程のままか
--   clientFollowups  … 三上様へお送りしたフォローの案。三上様が「この文で送る」を押したものだけお客様へ届く
--     status … pending（三上様の判断待ち）／sent（お客様へ送った）／skipped（送らない）
ALTER TABLE `userLineLinks` ADD COLUMN `lastActiveAt` timestamp NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `clientStallState` (
  `userId` int PRIMARY KEY,
  `stepKey` varchar(80) NOT NULL,
  `stepSince` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `clientFollowups` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `reason` varchar(40) NOT NULL,
  `stepKey` varchar(80) NULL,
  `daysStalled` int NOT NULL DEFAULT 0,
  `level` int NOT NULL DEFAULT 1,
  `message` text NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decidedAt` timestamp NULL,
  `decidedBy` int NULL
);
--> statement-breakpoint
CREATE INDEX `idx_clientFollowups_user` ON `clientFollowups` (`userId`, `createdAt`);
