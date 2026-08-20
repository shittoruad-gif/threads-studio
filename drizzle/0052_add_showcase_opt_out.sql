-- 実例ショーケース（/tour に匿名で掲載）の掲載拒否フラグ。
-- 既定は false（＝掲載可）。利用規約で同意を得たうえで、
-- 設定画面からいつでも本人が掲載を止められるようにする。
ALTER TABLE users ADD COLUMN showcaseOptOut BOOLEAN NOT NULL DEFAULT false;
