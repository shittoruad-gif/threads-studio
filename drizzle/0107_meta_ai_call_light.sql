-- Meta AI呼びかけを「3日に1回」に減らした日（2026-10-07 三上様「リーチを広げる最大限のことを」）。
-- 7日間使われなかったアカウントは、止めずに3日に1回お送りする。使われたら毎日に戻す。28日続けて使われなければ従来どおり止める。
ALTER TABLE `threadsAccounts` ADD COLUMN `metaAiCallLightAt` timestamp NULL;
