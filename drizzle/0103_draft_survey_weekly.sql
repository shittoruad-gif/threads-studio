-- 案の◯✕アンケートを週1回の定例に（2026-09-29 三上様指示「型Bを定期的に」）。
-- 案は毎週作って三上様のLINEへ下見を送り、三上様が「この8案を送る」を押したものだけお客様へ届く。
--   status：NULL＝これまでの手動送信（送信ずみ）／pending＝三上様の判断待ち／sent＝送信ずみ／skipped＝送らない／expired＝次の週の案に置き換わった
ALTER TABLE `draftSurveyItems` ADD COLUMN `status` varchar(12) NULL;
--> statement-breakpoint
ALTER TABLE `draftSurveyItems` ADD COLUMN `sentAt` timestamp NULL;
