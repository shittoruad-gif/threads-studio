-- Meta AI呼びかけを「再開」した日。再開から7日間は「使われていない」で止めない（2026-10-06：再開した翌朝にすぐまた止まっていた）。
ALTER TABLE `threadsAccounts` ADD COLUMN `metaAiCallResumedAt` timestamp NULL;
-- いま止まっていないアカウントは、この反映の日を再開日として扱う（10/6 に運営が再開したアカウントが翌朝また止まらないように）。
UPDATE `threadsAccounts` SET `metaAiCallResumedAt` = NOW() WHERE `metaAiCallPausedAt` IS NULL;
