-- 2026-09-19 三上様ご指摘：
--   「コメントの案を自動提示してくれるのに、「返信」を押すと違う案で返信されてしまう」
--
-- 公式LINEのコメントカードは、その場で作った文案を本文に出し、
-- ボタンには accountId と commentId しか持たせていなかった。
-- 「この文で送る」を押すと、送信側でもう一度AIに文案を作らせて
-- 「作り直した別の文」を送っていた（temperature 0.5 で毎回変わる）。
-- カードの説明文「その文のまま返信されます」と実際の動きが食い違っていた。
--
-- カードに出した文案をそのまま保存しておき、押されたときはその文だけを送る。
CREATE TABLE `commentReplyDrafts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `threadsAccountId` int NOT NULL,
  `commentId` varchar(64) NOT NULL,
  `draft` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `commentReplyDrafts_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_comment_reply_draft` UNIQUE(`threadsAccountId`,`commentId`)
);
--> statement-breakpoint
ALTER TABLE `commentReplyDrafts` ADD CONSTRAINT `commentReplyDrafts_threadsAccountId_threadsAccounts_id_fk` FOREIGN KEY (`threadsAccountId`) REFERENCES `threadsAccounts`(`id`) ON DELETE cascade ON UPDATE no action;
