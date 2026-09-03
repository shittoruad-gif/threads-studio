-- 投稿設定（自動投稿ON/OFF・公開前の確認・1日の回数・投稿の長さ）をアカウントごとに変えられるようにする。
-- NULL＝共通設定（users側）に従う。1アカウント運用の方には何も変わらない。
ALTER TABLE `threadsAccounts`
  ADD COLUMN `autoPostEnabled` boolean NULL,
  ADD COLUMN `autoPostRequireApproval` boolean NULL,
  ADD COLUMN `autoPostFrequency` varchar(20) NULL,
  ADD COLUMN `postLength` varchar(20) NULL;
