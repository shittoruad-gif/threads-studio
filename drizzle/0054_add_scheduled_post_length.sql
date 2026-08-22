-- その投稿を実際にどの長さ設定で作ったかを記録する。
-- 短め/長めを交互に出すA/Bテストの集計に使う（設定は後から変わるため、
-- 投稿時点の条件を投稿自身に残さないと後で比較できない）。
ALTER TABLE scheduledPosts ADD COLUMN postLength VARCHAR(10) NULL;
