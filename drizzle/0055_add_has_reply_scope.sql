-- そのアカウントの連携トークンが「返信作成」権限(threads_manage_replies)付きで
-- 取得されたか。2026-08-30のMeta審査でこの権限だけ非承認となり、
-- 以後の新規連携では要求しないため false になる。
-- 既存の連携（テスター登録済み）は権限付きで取得済みなので true に埋める。
ALTER TABLE threadsAccounts ADD COLUMN hasReplyScope BOOLEAN NOT NULL DEFAULT false;
UPDATE threadsAccounts SET hasReplyScope = true;
