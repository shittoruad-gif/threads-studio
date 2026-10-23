-- プランを変えた日時（2026-10-23）。月の投稿の上限は、月の初めかプランを変えた日の遅い方から数える。
-- 月の途中でプロ→ライトに下げると、プロの間に出した本数でライトの上限（40）を超え、月末まで1本も出なくなっていた。
ALTER TABLE `subscriptions` ADD COLUMN `planChangedAt` timestamp NULL;
