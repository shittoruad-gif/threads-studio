-- Threads連携済みなのにデモモードのまま残っている方を本番モードへ。
-- 以後は連携時に自動で切り替わる（server/routers.ts threads.connect）。
UPDATE `users` u
SET u.`isDemoMode` = 0
WHERE u.`isDemoMode` = 1
  AND EXISTS (SELECT 1 FROM `threadsAccounts` t WHERE t.`userId` = u.`id` AND t.`isActive` = 1);
