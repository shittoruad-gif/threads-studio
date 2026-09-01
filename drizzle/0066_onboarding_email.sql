-- 登録したまま止まっている方への、メールでのご案内。
--
-- 「次にやること」の公式LINE通知は、LINE連携済みの方にしか届かない。
-- ところが止まっている方の多くは、そもそもLINE連携をしていない。
-- そこで、その方々にはメールでお伝えする。
--
-- しつこくしないため、送った回数を記録して2通で打ち止めにする。
-- また、いつでも止められるように配信停止の状態も持つ。
ALTER TABLE `users` ADD COLUMN `onboardingEmailStage` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `onboardingEmailLastSentAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `emailOptOut` tinyint NOT NULL DEFAULT 0;
