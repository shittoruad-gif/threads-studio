-- 営業担当別クーポンの担当者名の表記ゆれを修正（2026-09-01 三上さん確認）
-- DBに手動登録された説明文の下の名前が誤っていた（正: 大木慎也 / 佐々木竜也）。
-- shared/plans.ts の SEMINAR_PRICE_CODES のコメントが正しい表記。
UPDATE `coupons` SET `description` = '営業担当：大木慎也（セミナー価格・3ヶ月適用）' WHERE `code` = 'OHKI2026';
--> statement-breakpoint
UPDATE `coupons` SET `description` = '営業担当：佐々木竜也（セミナー価格・3ヶ月適用）' WHERE `code` = 'SASAKI2026';
