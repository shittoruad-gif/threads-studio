-- 店舗名・屋号（セミナー情報配信・本人確認のために取得。任意・後から変更可）
ALTER TABLE `users` ADD COLUMN `storeName` varchar(255) NULL;
