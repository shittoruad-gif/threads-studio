/**
 * 投稿の長さ設定。
 *
 * 既定は「短め」。実測で短いほど圧倒的に見られるため（下表）、
 * 何も選ばなければ短めで運用する。
 *
 *   本番の自社データ（2026-08-23・追い投稿を除く本投稿491件）
 *     100字以下  … 平均431回表示 / 反応2.50
 *     101-150字  … 平均138回表示 / 反応2.21
 *     151字以上  … 平均 46回表示 / 反応0.84
 *
 * ただし「悩みを具体的に描いて、原因を説明して、変化を見せる」型は
 * 短文に収まらない。読ませて刺す設計を選べるように「長め」を用意する。
 * 長めはリーチが落ちることを承知のうえで選ぶ設定。
 */

export type PostLength = 'short' | 'long';

/**
 * 設定値。'alternate' は短め/長めを交互に出すA/Bテスト用。
 * どちらが効くかを実データで決めるために使う。
 */
export type PostLengthSetting = PostLength | 'alternate';

export const DEFAULT_POST_LENGTH: PostLength = 'short';

export interface PostLengthConfig {
  /** 生成後に機械的に切り詰める上限（本文＋CTA） */
  charBudget: number;
  /** プロンプトに書く目安 */
  guide: string;
  /** 設定画面の表示名 */
  label: string;
  /** 設定画面の説明 */
  description: string;
}

export const POST_LENGTHS: Record<PostLength, PostLengthConfig> = {
  short: {
    charBudget: 140,
    guide: '本文は50〜100字。1文を短くし、言い切って終わる。長くなったら情報を削る。',
    label: '短め（おすすめ）',
    description: '50〜100字。実測でいちばん見られる長さです。',
  },
  long: {
    charBudget: 300,
    guide:
      '本文は250〜300字。悩み→原因や勘違い→変わった後、の順に書き切る。'
      + 'ただし1文は短く、2〜3行ごとに空行を入れて読みやすさを保つ。'
      + '字数を埋めるための水増し（同じ内容の言い換え・一般論の付け足し）は禁止。',
    label: '長め',
    description: '250〜300字。じっくり読ませる型に向きますが、表示回数は落ちます。',
  },
};

/** 設定値を安全に解決する（未設定・不正値は既定へ）。'alternate' は resolveWithAlternation で解く */
export function resolvePostLength(v: string | null | undefined): PostLength {
  return v === 'long' ? 'long' : DEFAULT_POST_LENGTH;
}

/**
 * A/Bテスト時の割り当て。
 *
 * 「日」と「その日の何本目か」の両方で交互にする。
 * 日だけで切り替えると、長めが常に同じ時間帯に当たってしまい、
 * 時間帯の有利不利と混ざって結果が読めなくなる（15時と21時では表示回数が違う）。
 *
 * @param dayNumber JSTでの通日（1970-01-01からの日数）
 * @param slotIndex その日の何本目か（0始まり）
 */
export function alternatedLength(dayNumber: number, slotIndex: number): PostLength {
  return (dayNumber + slotIndex) % 2 === 0 ? 'short' : 'long';
}

/** JSTの通日。日付境界を日本時間で切る */
export function jstDayNumber(now: number = Date.now()): number {
  return Math.floor((now + 9 * 60 * 60 * 1000) / 86400000);
}

/**
 * 設定値と投稿の位置から、実際に使う長さを決める。
 * 'alternate' のときだけ交互割り当て、それ以外は設定どおり。
 */
export function resolveWithAlternation(
  setting: string | null | undefined,
  slotIndex: number,
  now: number = Date.now(),
): PostLength {
  if (setting === 'alternate') return alternatedLength(jstDayNumber(now), slotIndex);
  return resolvePostLength(setting);
}

/** 解決済みの長さに対応する上限文字数 */
export function charBudgetFor(v: string | null | undefined): number {
  return POST_LENGTHS[resolvePostLength(v)].charBudget;
}
