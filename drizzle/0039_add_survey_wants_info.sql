-- アンケート：登録メールへの案内送付可否（デフォルトは希望する）
ALTER TABLE `contentInterestSurvey` ADD COLUMN `wantsInfo` boolean NOT NULL DEFAULT true;
