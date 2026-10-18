/**
 * トピック（topic_tag）の付け方（2026-10-18 三上様「自動トピックは今夜の反映で全アカウント止めて。
 * 学習用の3アカウントだけ、中身に合うトピックを付ける投稿と付けない投稿を交互に出して2週間比べて」）。
 *
 * 経緯：7/5 から、店舗情報の「主な悩み」の先頭の言葉を全投稿に同じトピックとして付けていた
 * （金光は直近100本中96本が「慢性的な肩こり」。そうめん・天文台の投稿にも付いていた）。
 * 10/18 に26アカウント約3,600本で、トピックあり／なしをアカウントの中で比べたが差は無かった
 * （両方5本以上の14件で倍率の中央値1.10・あり>なし 8件／あり<なし 6件。なしの多くは手書きなので切り分けはできていない）。
 *
 * そこで：
 *  - お客様のアカウントには付けない（設定のON/OFFにかかわらず）。
 *  - 学習用の3アカウントだけ、期間中は予約の投稿の id の偶奇で「付ける／付けない」を交互にする。
 *    付ける側でも、本文に合う言葉（地名・体の悩み・話題）が見つからなければ付けない。
 *  - 集計 scripts/ops/topic-tag-trial-report.mts：本文に合う言葉がある投稿だけで「付けた／付けなかった」を比べる。
 *  - 期間が過ぎたら学習用アカウントにも付けない（続けるかは結果を見て三上様が決める）。
 */

export const TOPIC_TAG_TRIAL = {
  accountIds: [10, 12, 36] as readonly number[],
  /** JSTの日付。この日から until の日まで（両端を含む） */
  start: "2026-10-19",
  until: "2026-11-01",
} as const;

const JST = 9 * 3600_000;
const jstYmd = (now: number) => new Date(now + JST).toISOString().slice(0, 10);

/** 地名（登録の地域に無くても、学習用アカウントの近くでよく出るもの） */
const PLACES = [
  "浅口", "金光", "鴨方", "寄島", "里庄", "笠岡", "玉島", "倉敷", "水島", "児島", "総社", "早島", "矢掛", "井原", "岡山",
];

/** 体の悩み・話題（本文に出てくる形のまま。長い言葉を先に並べる＝「慢性的な肩こり」より「肩こり」で拾う） */
const SUBJECTS = [
  "肩こり", "腰痛", "猫背", "姿勢", "反り腰", "頭痛", "首こり", "膝の痛み", "産後", "骨盤", "冷え", "むくみ", "睡眠",
  "デスクワーク", "ストレッチ", "ピラティス", "整体", "鍼灸", "トレーニング", "ダイエット", "子どもの運動", "野球", "部活",
  "集客", "SNS", "Threads", "Instagram", "インスタ", "公式LINE", "LINE", "広告", "ホームページ", "口コミ", "予約",
];

/** 登録の地域（例「岡山県倉敷市玉島」）から地名の候補を取り出す */
function areaTokens(area: string | null | undefined): string[] {
  return (area || "")
    .split(/[都道府県市区町村\s、,・/]+/)
    .map((s) => s.trim())
    .filter((s) => Array.from(s).length >= 2 && Array.from(s).length <= 8 && !/[0-9０-９\-－]/.test(s));
}

/**
 * 本文に合うトピックを1つ選ぶ。本文の中でいちばん先に出てくる地名・話題（＝その投稿の主題）。
 * 見つからなければ null（付けない）。作り話にならないよう、本文に実際に書かれている言葉だけを使う。
 */
export function contentTopicTag(text: string | null | undefined, area?: string | null): string | null {
  const body = text || "";
  if (!body) return null;
  const words = Array.from(new Set(areaTokens(area).concat(PLACES, SUBJECTS)));
  let best: { word: string; at: number } | null = null;
  for (const w of words) {
    const at = body.indexOf(w);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && w.length > best.word.length)) best = { word: w, at };
  }
  return best ? best.word : null;
}

/** 期間中の学習用アカウントか */
export function inTopicTagTrial(threadsAccountId: number, now = Date.now()): boolean {
  const ymd = jstYmd(now);
  return (
    TOPIC_TAG_TRIAL.accountIds.includes(Number(threadsAccountId)) &&
    ymd >= TOPIC_TAG_TRIAL.start &&
    ymd <= TOPIC_TAG_TRIAL.until
  );
}

/** 交互の割り当て：予約の投稿の id が偶数＝付ける／奇数＝付けない */
export function topicTagArm(postId: number): "tag" | "none" {
  return Number(postId) % 2 === 0 ? "tag" : "none";
}

/**
 * 予約の投稿を公開するときのトピック。学習用アカウントの期間中・付ける側・本文に合う言葉があるときだけ返す。
 * それ以外（お客様のアカウント・期間外・付けない側・合う言葉なし）は undefined＝付けない。
 */
export function scheduledPostTopicTag(params: {
  threadsAccountId: number;
  postId: number;
  text: string | null | undefined;
  area?: string | null;
  userAutoTopicTag?: boolean | null;
  now?: number;
}): string | undefined {
  if (params.userAutoTopicTag === false) return undefined;
  if (!inTopicTagTrial(params.threadsAccountId, params.now)) return undefined;
  if (topicTagArm(params.postId) !== "tag") return undefined;
  return contentTopicTag(params.text, params.area) ?? undefined;
}
