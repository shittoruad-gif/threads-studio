-- 投稿の長さ設定（short=既定 / long=300字程度）。
-- 実測で短いほど見られるため既定は short。長文型を使いたいときだけ long を選ぶ。
ALTER TABLE users ADD COLUMN postLength VARCHAR(10) NOT NULL DEFAULT 'short';
