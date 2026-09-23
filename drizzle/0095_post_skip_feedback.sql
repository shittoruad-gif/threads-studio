-- 2026-09-24 三上様指示
--   「相手に3案送って見送った場合に、何がその見送る原因になったのかを、
--     質問もしくはどのような形でもいいので見つけるようにしてください」
--
-- 3案を見送ったあとに公式LINEで理由を1つお聞きし（ボタン or 文章）、その答えを残す。
-- 翌朝の生成がこれを読み、同じ理由で見送られない投稿を作る（shared/declinedPatterns.ts）。
--   reason     … same / claim / tone / length / today / text
--   reasonText … 「文章で伝える」を選ばれたときの、お客様の言葉そのまま
CREATE TABLE IF NOT EXISTS `postSkipFeedback` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `userId` int NOT NULL,
  `threadsAccountId` int NOT NULL,
  `choiceGroupId` varchar(40) NULL,
  `postId` int NULL,
  `reason` varchar(20) NOT NULL,
  `reasonText` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_postSkipFeedback_account` ON `postSkipFeedback` (`threadsAccountId`, `createdAt`);
