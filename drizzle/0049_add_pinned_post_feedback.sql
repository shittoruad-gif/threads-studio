-- 固定投稿ウィザードのStep3で収集する好みフィードバックを保存する。
-- { dislikes: string[], updatedAt: string } の JSON を格納。
-- AI生成プロンプトに「このユーザーが嫌いな書き方」として差し込み精度を高める。
ALTER TABLE `projects` ADD COLUMN `pinnedPostFeedback` text;
