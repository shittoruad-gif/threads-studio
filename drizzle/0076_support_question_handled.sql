-- お問い合わせの「対応済み」チェック。
-- LINEの返信ボタンを使わず、お電話や個人のLINEで直接お答えした分にも印を付けられるようにする
-- （repliedAt はこの画面から送った返信だけに入るので、それだけでは対応済みか分からなかった）。
ALTER TABLE `supportQuestions` ADD COLUMN `handledAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `supportQuestions` ADD COLUMN `handledBy` varchar(120) NULL;
