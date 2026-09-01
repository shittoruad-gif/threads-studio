-- 利用規約・プライバシーポリシー・特定商取引法に基づく表記への同意の記録。
-- 「誰が・いつ・どの版に同意したか」を後から示せるようにする（後日の紛争対策）。
ALTER TABLE `users` ADD COLUMN `termsAgreedAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `termsVersion` varchar(20) NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `termsAgreedIp` varchar(64) NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `termsAgreedUa` varchar(255) NULL;
