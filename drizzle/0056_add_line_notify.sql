-- LINE通知連携（段階1）。公式LINEから承認依頼・コメント通知を受け取るための紐づけ。
ALTER TABLE users ADD COLUMN lineUserId VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN lineLinkCode VARCHAR(10) NULL;
ALTER TABLE users ADD COLUMN lineLinkCodeExpiresAt TIMESTAMP NULL;
