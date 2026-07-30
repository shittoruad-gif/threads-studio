-- LINE問い合わせ計測（Keiro連携）: 投稿別の合言葉ヒット数集計用の接続設定
ALTER TABLE `projects` ADD COLUMN `keiroHitsUrl` text NULL;
ALTER TABLE `projects` ADD COLUMN `keiroHitsKey` text NULL;
