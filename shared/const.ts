export const COOKIE_NAME = "app_session_id";
/**
 * 連続投稿（ツリー）の各セグメント区切り。投稿本文（postContent）内にこの区切りがあれば、
 * Threadsの返信チェーンとして「1セグメント=1投稿」で連続投稿する。区切りが無ければ単一投稿。
 */
export const THREAD_SEGMENT_DELIMITER = "\n[[THREAD_BREAK]]\n";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
