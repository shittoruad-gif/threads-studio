/**
 * 投稿の生エラーメッセージ（API由来・英語/技術用語混在）を、
 * 店舗オーナーが理解して次の行動を取れる「日本語の原因＋推奨アクション」に変換する。
 *
 * scheduledPostExecutor.ts / threadsPost.ts / threadsApi.ts が保存・送出する
 * 代表的な errorMessage を分類している。未知のものは汎用メッセージにフォールバック。
 */

export type PostErrorAction = 'reauth' | 'retry' | 'wait' | 'none';

export interface TranslatedPostError {
  /** 一言でわかる原因 */
  title: string;
  /** 補足説明（任意） */
  detail?: string;
  /** ユーザーが取るべき行動の種別 */
  action: PostErrorAction;
  /** アクションボタンの文言（action !== 'none' のとき） */
  actionLabel?: string;
  /** 重大度（UIの色分け用） */
  severity: 'error' | 'warning';
}

/**
 * 生エラー文字列 → 日本語の原因＋アクション
 */
export function translatePostError(raw?: string | null): TranslatedPostError {
  const msg = (raw ?? '').toString();
  const lower = msg.toLowerCase();

  // ── 連携アカウントが見つからない（解除/失効）────────────────
  if (/account not found|アカウントが見つか|account.*not.*exist/i.test(msg)) {
    return {
      title: 'Threads連携が見つかりませんでした',
      detail: 'アカウントの連携が解除されたか、失効しています。もう一度連携すると復旧します。',
      action: 'reauth',
      actionLabel: 'Threads連携を確認',
      severity: 'error',
    };
  }

  // ── トークン期限切れ（自動更新も失敗）──────────────────────
  if (/token expired|access token|expired|失効|有効期限|reauth/i.test(msg)) {
    return {
      title: 'Threads連携の有効期限が切れています',
      detail: '安全のため一定期間で連携の更新が必要です。「Threads連携を確認」から更新してください。',
      action: 'reauth',
      actionLabel: 'Threads連携を確認',
      severity: 'error',
    };
  }

  // ── 権限不足（code:10 / permission）────────────────────────
  if (/code:?\s*10|permission|権限/i.test(msg)) {
    return {
      title: 'Threadsの投稿権限が不足しています',
      detail: '連携時の許可が一部不足しています。一度連携を解除し、すべての項目を許可して再連携してください。',
      action: 'reauth',
      actionLabel: 'Threads連携を確認',
      severity: 'error',
    };
  }

  // ── 続き投稿の一部失敗（メインは公開済み・再試行しない）──────
  if (/公開済み|一部失敗|partial/i.test(msg)) {
    return {
      title: '最初の投稿は公開できましたが、続きの投稿が一部失敗しました',
      detail: '重複投稿を避けるため自動の再試行は行いません。Threadsで実際の表示をご確認ください。',
      action: 'none',
      severity: 'warning',
    };
  }

  // ── メディア未準備/一時的なAPIエラー（code:24 等・再試行で直る）─
  if (/code:?\s*24|does not exist|見つかりません|container|media|timeout|temporar|一時的/i.test(lower) || /failed to (publish|create|get)/i.test(lower)) {
    return {
      title: 'Threads側で一時的なエラーが発生しました',
      detail: '時間をおいて再試行するとうまくいくことが多いです。',
      action: 'retry',
      actionLabel: '再試行',
      severity: 'warning',
    };
  }

  // ── ネットワーク系 ─────────────────────────────────────────
  if (/network|fetch failed|econn|timeout|status fetch failed/i.test(lower)) {
    return {
      title: '通信エラーが発生しました',
      detail: 'ネットワークの状態をご確認のうえ、少し待ってから再試行してください。',
      action: 'retry',
      actionLabel: '再試行',
      severity: 'warning',
    };
  }

  // ── フォールバック（未分類）────────────────────────────────
  return {
    title: '投稿に失敗しました',
    detail: '一時的な不具合の可能性があります。少し待ってから再試行してください。解決しない場合はサポートへご連絡ください。',
    action: 'retry',
    actionLabel: '再試行',
    severity: 'error',
  };
}
