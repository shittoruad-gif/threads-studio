-- 2026-09-24 三上様指示「8案を1回送って、◯か✕かで選んでもらい、残ったものを中心に作っていく」。
-- 見送りが続くお客様（プレステージ様・香取様）に、切り口の違う案をまとめてお送りし、◯✕だけ付けていただく。
-- ★投稿（scheduledPosts）にはしない。公開されず、✕も「見送り」には数えない
--   （数えると「見送りが続いている」と判定され、翌朝3案が出てしまう）。
--   ◯ … 文体のお手本（projects.styleSamples）に足す＋生成の「好み」に最優先で入れる
--   ✕ … 生成の「避ける方向性」に入れる
CREATE TABLE IF NOT EXISTS `draftSurveyItems` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `surveyKey` varchar(40) NOT NULL,
  `userId` int NOT NULL,
  `threadsAccountId` int NOT NULL,
  `projectId` varchar(50) NOT NULL,
  `angle` varchar(40) NULL,
  `label` varchar(60) NULL,
  `content` text NOT NULL,
  `rating` varchar(8) NULL,
  `ratedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_draftSurveyItems_project` ON `draftSurveyItems` (`projectId`, `rating`, `ratedAt`);
