/**
 * 入力サニタイズユーティリティ
 *
 * AI 投稿生成・メール送信などで、ユーザ入力を文字列テンプレートに
 * 直接 interpolate する箇所のセキュリティ・運用安全性を担保する。
 */

/**
 * AI プロンプトに差し込む前にユーザ入力を清掃する。
 *
 * 防ぎたい攻撃:
 *  - 「Ignore previous instructions」型のジェイルブレイク
 *  - システムプロンプトを「### system」「<|system|>」などのマーカーで偽装
 *  - 改行で「JSONここで終わり」と AI を騙す
 *  - 巨大入力で他のセクションを押し流す
 *
 * 戦略:
 *  - 制御文字を除去
 *  - 連続改行を 1 行に圧縮
 *  - チャットテンプレ系マーカー / コードフェンス開始記号を無害化
 *  - 既知のジェイルブレイク文を検知してログ + マスク
 *  - 長さに上限（フィールドごとに）
 */
export function sanitizeForPrompt(input: string | null | undefined, maxLen = 500): string {
  if (input == null) return '';
  let s = String(input);

  // 1. 制御文字（\x00 〜 \x1f, \x7f）を空白に
  s = s.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, ' ');

  // 2. 連続改行を 1 行に
  s = s.replace(/\n{3,}/g, '\n\n');

  // 3. 危険なマーカーを無害化
  const replacements: [RegExp, string][] = [
    // チャットテンプレ風
    [/<\|(system|user|assistant|im_start|im_end)\|>/gi, '〈〉'],
    [/\[INST\]/g, '〈〉'],
    [/\[\/INST\]/g, '〈〉'],
    // セクション擬似ヘッダ
    [/^#{1,6}\s*(system|instruction|role|task|プロンプト|システム|ロール)/gim, '> '],
    // 「Ignore previous」「Forget earlier」などの直接命令
    [/ignore (the )?(previous|prior|all|above)/gi, '(redacted)'],
    [/disregard (the )?(previous|prior|all|above)/gi, '(redacted)'],
    [/以前(の|までの)指示(は|を)?(無視|忘れ)/g, '(削除)'],
    [/上記(の|までの)指示(は|を)?(無視|忘れ)/g, '(削除)'],
    [/forget (everything|all) (above|prior|previous)/gi, '(redacted)'],
    // システムプロンプト漏洩を要求
    [/(reveal|show|print|output) (your |the |this )?(system|initial) prompt/gi, '(redacted)'],
    [/system prompt(?:を)?(?:教え|表示|出力|見せ)/g, '(削除)'],
    // コードフェンスでセクションを偽装するのも無害化
    [/```(system|user|assistant|json|tool)/gi, '```'],
  ];
  for (const [re, repl] of replacements) {
    s = s.replace(re, repl);
  }

  // 4. 長さ上限（プロンプト全体を圧迫させない）
  //    コードポイント単位で切る（絵文字・サロゲートペアを壊さない）
  const cps = Array.from(s);
  if (cps.length > maxLen) {
    s = cps.slice(0, maxLen).join('') + '…';
  }

  return s.trim();
}

/**
 * 生成された投稿本文から「生の外部URL」を除去する。
 * 方針A（教科書準拠）では本文に http(s):// のURLを貼らず、プロフィール/固定投稿へ誘導する。
 * AIが指示を無視してURLを混入した場合の最終的な機械担保。
 * URL除去後に生じる余分な空白・記号も軽く整える。
 */
export function stripRawUrls(input: string | null | undefined): string {
  if (input == null) return '';
  let s = String(input);
  // http(s):// で始まるURL（末尾の句読点は残す）
  s = s.replace(/https?:\/\/[^\s　]+/g, '');
  // 「→ 」「（）」など、URLが消えて残った誘導記号まわりの空白を軽く整える
  s = s.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[（(]\s*[）)]/g, ''); // 空になった括弧
  return s.trim();
}

/**
 * メール HTML に差し込む前にユーザ入力をエスケープ。
 * Resend は HTML をそのまま送るので、& < > " ' を実体参照に変換する。
 */
export function escapeHtml(input: string | null | undefined): string {
  if (input == null) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL のホストが許容ドメインに合致するかチェック。
 * メール本文のリンク改ざんを防ぐ用途（外部 URL を埋め込む場合）。
 */
export function isAllowedRedirectHost(url: string, allowedHosts: string[]): boolean {
  try {
    const u = new URL(url);
    return allowedHosts.includes(u.host);
  } catch {
    return false;
  }
}

/**
 * #26 クライアントに返してよい安全な公開エラーメッセージに変換する。
 *
 * - DB スキーマ・SQL・スタックトレース・Threads API の生レスポンスを露出させない
 * - 既知の安全カテゴリ（Threadsの「Rate limit」「Token expired」等）は短縮して返す
 * - それ以外は generic な「サービスエラー」に置き換える
 *
 * 元のエラーは呼び出し側で必ず console.error すること（運用追跡用）。
 */
export function toPublicErrorMessage(err: unknown, fallback = '一時的なエラーが発生しました。しばらく経ってから再度お試しください。'): string {
  if (!err) return fallback;
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  // Threads(Meta Graph) API の生レスポンスJSONが混ざっている場合、
  // エラーコード番号からユーザが行動できる日本語文言に変換する。
  // 生JSON（"code":190 等）やfbtrace_idをそのままメール・画面に出さない。
  const codeMatch = raw.match(/"code"\s*:\s*(\d+)/);
  const looksLikeThreadsRaw =
    /failed to (create|publish) media container|failed to get container status|oauthexception|fbtrace_id/i.test(raw);
  if (codeMatch || looksLikeThreadsRaw) {
    const code = codeMatch ? Number(codeMatch[1]) : null;
    if (code === 190 || lower.includes('oauthexception')) {
      return 'Threads連携の有効期限が切れています。アプリの「Threads連携」から再連携してください。';
    }
    if (code === 4 || code === 17 || code === 32 || code === 613) {
      return 'Threadsの投稿回数制限（レート制限）に達しました。時間を置くと自動的に解除されます。';
    }
    if (code === 24) {
      return 'Threads側で投稿の処理が完了しませんでした。一時的なエラーのことが多く、時間を置いて再投稿すると解決します。';
    }
    if (code === 368) {
      return 'Threads側で投稿が一時的に制限されています。時間を置いてから再度お試しください。';
    }
    return 'Threadsへの投稿処理でエラーが発生しました。一時的なことが多いため、時間を置いてから再度お試しください。';
  }

  // Threads API のよくあるエラー（ユーザに伝えると行動できるもの）
  if (lower.includes('rate limit') || lower.includes('rate-limit')) {
    return 'Threads APIのレート制限に達しました。しばらく待ってから再度お試しください。';
  }
  if (lower.includes('access token') || lower.includes('expired') || lower.includes('invalid token')) {
    return 'アクセストークンの有効期限が切れています。Threads再連携してください。';
  }
  if (lower.includes('429')) return 'リクエストが多すぎます。しばらく待ってから再度お試しください。';
  if (lower.includes('503') || lower.includes('502') || lower.includes('504')) {
    return '外部サービスが一時的に利用できません。少し時間を置いてから再度お試しください。';
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'リクエストがタイムアウトしました。再度お試しください。';
  }
  if (lower.includes('fetch failed') || lower.includes('network')) {
    return '通信エラーが発生しました。一時的なことが多いため、時間を置いてから再度お試しください。';
  }
  if (raw.includes('コンテナの処理に失敗')) {
    // 内部用語（コンテナ・status=）を出さずに言い換える
    return 'Threads側で投稿の処理が完了しませんでした。一時的なエラーのことが多く、時間を置いて再投稿すると解決します。';
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return '対象が見つかりませんでした。';
  }

  // 内部実装が漏れる可能性のあるパターンは fallback に置換
  const looksInternal =
    lower.includes('select ') ||
    lower.includes('insert ') ||
    lower.includes('update ') ||
    lower.includes('delete from') ||
    lower.includes('econn') ||
    lower.includes('mysql') ||
    lower.includes('drizzle') ||
    lower.includes('typeerror') ||
    lower.includes('referenceerror') ||
    lower.includes('cannot read') ||
    lower.includes('undefined') ||
    lower.length > 200;
  if (looksInternal) return fallback;

  return raw;
}
