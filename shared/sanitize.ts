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
  if (s.length > maxLen) {
    s = s.slice(0, maxLen) + '…';
  }

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
