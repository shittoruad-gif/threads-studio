/**
 * アカウントごとの「書かない言葉」（コードで持つ決まり・2026-10-18）。
 *
 * お客様が画面で登録する NGワード（projects.ngWords・shared/ngwords.ts）は言い換えて残す仕組みで、
 * 登録の中身（業種・強み）に入っている言葉は止められない。ここは運営の方針として「絶対に書かない」言葉で、
 *   1. 生成の前：お店の情報（業種・強み・実績など）からこの言葉を外してから渡し、プロンプトでも禁止する
 *   2. 生成の後：本文に残っていたら、最後の作り直し・保証パスでも公開しない（作り直し／見送り）
 *   3. 公開の直前：自動の投稿（source='auto'）に残っていたら公開せず取り消す（server/scheduledPostExecutor.ts）
 * の3か所で止める。
 *
 * ★Moveact 玉島（account 10）：「マシン」を書かない（三上様の方針：玉島のマシンは「あるが必ず使わない」）。
 *   登録の業種が「マシンピラティススタジオ（整体・美容鍼併設）」で、共通の指示のお手本にも
 *   「マシンが支えてくれるピラティス」があったため、自動の投稿に
 *   「マシンがサポートするので大丈夫です」「マシンピラティスなら無理なく続けられますよ」が出ていた。
 */

export interface AccountBannedRule {
  /** 本文に出てはいけない言葉（正規表現・大文字小文字を区別しない） */
  pattern: RegExp;
  /** プロンプトに書く、禁止の言葉の一覧（人が読む形） */
  words: readonly string[];
  /** なぜ書かないか（ログ・作り直しの指示用） */
  reason: string;
}

export const ACCOUNT_BANNED_WORDS: Readonly<Record<number, AccountBannedRule>> = {
  10: {
    pattern: /マシン|ﾏｼﾝ|machine|リフォーマー|reformer|キャデラック|cadillac/i,
    words: ['マシン', 'マシンピラティス', 'machine', 'リフォーマー'],
    reason: 'Moveact 玉島ではマシンを使わない（運営の方針）',
  },
};

export function bannedRuleFor(accountId: number | null | undefined): AccountBannedRule | null {
  if (accountId == null) return null;
  return ACCOUNT_BANNED_WORDS[Number(accountId)] ?? null;
}

/** 本文に残っている禁止の言葉（無ければ null） */
export function findAccountBannedWord(accountId: number | null | undefined, text: string | null | undefined): string | null {
  const rule = bannedRuleFor(accountId);
  if (!rule) return null;
  const m = String(text ?? '').match(rule.pattern);
  return m ? m[0] : null;
}

/**
 * お店の情報の文字列から禁止の言葉を外す（生成に渡す前・メモリの上だけ。DBは変えない）。
 * 「マシンピラティススタジオ」→「ピラティススタジオ」、「マシンピラティス完備」→「ピラティス完備」。
 * 外した結果、区切りだけが残る（「、、」「・・」）のは詰める。
 */
export function scrubBannedText(rule: AccountBannedRule, text: string): string {
  const g = new RegExp(rule.pattern.source, rule.pattern.flags.includes('g') ? rule.pattern.flags : rule.pattern.flags + 'g');
  return text
    .replace(g, '')
    .replace(/([、,・／/])\1+/g, '$1')
    .replace(/(^|\n)[、,・／/]\s*/g, '$1')
    .replace(/[（(]\s*[)）]/g, '');
}

/** プロジェクト（お店の情報）の文字列の欄から、禁止の言葉を外したコピーを返す（はじめの設定の答えも外す） */
export function scrubProjectForAccount<T extends Record<string, any>>(accountId: number | null | undefined, project: T): T {
  const rule = bannedRuleFor(accountId);
  if (!rule || !project) return project;
  const scrubValue = (v: unknown): unknown => {
    if (typeof v === 'string') return rule.pattern.test(v) ? scrubBannedText(rule, v) : v;
    if (Array.isArray(v)) return v.map(scrubValue);
    if (v && typeof v === 'object') {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = scrubValue(x);
      return o;
    }
    return v;
  };
  const out: Record<string, any> = { ...project };
  for (const [k, v] of Object.entries(project)) {
    if (k === 'id' || k === 'userId' || k === 'links' || k === 'ctaLink') continue;
    if (k === 'counselingResult' && typeof v === 'string') {
      try { out[k] = JSON.stringify(scrubValue(JSON.parse(v))); } catch { out[k] = scrubValue(v); }
      continue;
    }
    if (typeof v === 'string') out[k] = scrubValue(v);
  }
  return out as T;
}

/** 生成プロンプトに付ける禁止の指示（ルールが無いアカウントは空文字） */
export function accountBannedNote(accountId: number | null | undefined): string {
  const rule = bannedRuleFor(accountId);
  if (!rule) return '';
  return `\n\n【このアカウントで絶対に書かない言葉（運営の方針・すべての指示より優先）】\n${rule.words.map((w) => `- 「${w}」`).join('\n')}\n- この言葉と、言い換え（機械・器具で支える 等）も書かない。理由：${rule.reason}。`;
}
