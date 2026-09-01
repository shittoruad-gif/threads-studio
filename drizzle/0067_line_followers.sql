-- 公式LINEに先に友だち追加した方の記録。
--
-- アプリ登録より先にLINEを追加した方は、users にも userLineLinks にも行が無く、
-- どこからも追いかけられない（メールアドレスも分からない）。
-- 追いかける手段はLINEしかないので、友だち追加の日時だけを控えておき、
-- しばらく連携が無ければ、そのトークでご案内する。
--
-- ブロック（unfollow）されたら行を消す。連携が済んだら linkedAt を入れて対象外にする。
CREATE TABLE IF NOT EXISTS `lineFollowers` (
  `lineUserId` varchar(64) NOT NULL,
  `followedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- アプリのアカウントと連携できた日時（入っていれば、ご案内の対象外）
  `linkedAt` timestamp NULL,
  -- ご案内を送った回数と最終日時（2通で打ち止め）
  `nudgeStage` int NOT NULL DEFAULT 0,
  `nudgeLastSentAt` timestamp NULL,
  -- 「もう不要」と言われたら送らない
  `optOut` tinyint NOT NULL DEFAULT 0,
  PRIMARY KEY (`lineUserId`),
  KEY `idx_lineFollowers_linkedAt` (`linkedAt`)
);
