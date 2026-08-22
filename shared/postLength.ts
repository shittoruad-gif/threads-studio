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

/** 設定値を安全に解決する（未設定・不正値は既定へ） */
export function resolvePostLength(v: string | null | undefined): PostLength {
  return v === 'long' ? 'long' : DEFAULT_POST_LENGTH;
}

/** 設定に対応する上限文字数 */
export function charBudgetFor(v: string | null | undefined): number {
  return POST_LENGTHS[resolvePostLength(v)].charBudget;
}
