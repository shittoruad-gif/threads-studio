/**
 * 自動投稿の「切り口」カタログ＋◯✕フィードバックによる重み付け選択。
 *
 * 従来は投稿タイプ（あるある/共感/Q&A…）の決まった巡回だけで、書き出しも
 * 「冒頭数字」型に寄りがちだった。ここでは「切り口（アングル）」という
 * もう1つの軸をランダム（重み付き）で掛け合わせ、投稿の幅を広げる。
 *
 * クライアントは投稿履歴の◯✕（clientRating）で好みを教える：
 *   ◯が付いた切り口 → 出やすくなる ／ ✕が付いた切り口 → 出にくくなる
 *
 * 重要: どの切り口も「カウンセリングで入力された事実だけを使う」大原則の
 * 内側で動く。事実が無い切り口を無理に書かせないよう、hintには
 * 「入力情報に無ければ別の面から書く」逃げ道を必ず含めている。
 */

export interface PostAngle {
  id: string;
  /** 履歴画面などで表示する短いラベル */
  label: string;
  /** 生成プロンプトに注入する切り口の指示 */
  hint: string;
}

export const POST_ANGLES: PostAngle[] = [
  {
    id: 'number_result',
    label: '数字・実績',
    hint: '入力情報にある「数字」（実績・期間・回数・人数など）を冒頭に置いて言い切る型。入力情報に数字が無ければ、悩みの言語化から始める。',
  },
  {
    id: 'aruaru',
    label: 'あるある',
    hint: 'ターゲットの日常に起きる「あるある」な瞬間をひとつだけ切り取って共感を作る。大げさにせず、具体的な場面（時間帯・場所・動作）で描く。',
  },
  {
    id: 'customer_voice',
    label: 'お客様の声',
    hint: '入力情報にある実際のお客様の言葉・エピソードを1つだけ紹介する。入力情報に無いセリフや人物を作らない。無ければ「よくいただく質問」の形にする。',
  },
  {
    id: 'behind_scenes',
    label: '裏側・こだわり',
    hint: 'お店の裏側のこだわり（なぜその施術・手順・道具なのか）を1つだけ語る。入力情報の「強み」「こだわり」を素材にする。',
  },
  {
    id: 'misconception',
    label: 'よくある誤解',
    hint: '「実は逆」「それ、もったいない」など、ターゲットが信じがちな誤解を1つ取り上げて正す。断定できる一般論の範囲で書き、誇大にしない。',
  },
  {
    id: 'qa',
    label: 'Q&A',
    hint: 'お客様からよく聞かれる質問を1つ取り上げ、短く答える。入力情報のFAQ・悩みを素材にする。',
  },
  {
    id: 'seasonal',
    label: '季節ネタ',
    hint: '今の季節の体調・生活の変化とお店の専門性をつなげる。プロンプト内の「今月の季節の話題」の範囲から選ぶ。',
  },
  {
    id: 'local',
    label: '地元ネタ',
    hint: '地域を「県」や「市」でなく**できるだけ狭く**言い切る（例：県名ではなく「◯◯駅から徒歩5分」）。実測では、広い地域名より駅＋徒歩分数のほうが新規の反応が明確に大きい。読み手が「うちの商圏だ」「通勤ルートだ」「仕事帰りに寄れる」と自分事にできるかが分かれ目。入力情報にある地域・駅・目印だけを使い、無い地名は作らない。',
  },
  {
    id: 'change_story',
    label: '変化の物語',
    hint: '来店前→来店後の変化を1人分だけ描く（ビフォーアフター）。入力情報にある実際の変化・実績だけを使い、無ければ「こうなったら理想」ではなく施術の目的を語る。',
  },
  {
    id: 'personality',
    label: '人柄・日常',
    hint: '先生・スタッフの人柄が伝わる小さな日常や考え方をひとこと。売り込みゼロで距離を縮める回。入力情報の人物・方針を素材にする。',
  },
  {
    id: 'lesson',
    label: '気づき・学び',
    hint: '仕事の中で得た気づき・学びを1つ共有する（失敗から学んだことも可）。説教にならないよう、自分の話として書く。',
  },
  {
    id: 'surprise_fact',
    label: '意外な事実',
    hint: '専門家には常識でも一般には意外な事実を1つだけ紹介する。一般論として正しい範囲で書き、数値や研究を捏造しない。',
  },
  // ── 実際のThreadsで伸びている「ポジティブ型」を反映（2026-08-15調査）──
  //   高反応だった投稿に共通していたのは「専門家に教わった小さな方法」＋
  //   「やってみたらこう変わった」の型。否定・煽り・同情喚起ではない。
  {
    id: 'pro_tip',
    label: 'プロの小ワザ',
    hint: '今日から自宅で無料でできる小さな方法を1つだけ、出し惜しみせず具体的に渡す（「1日5分」「10秒」など時間を添えると伝わる）。入力情報にある施術方針・強みの範囲で書き、効果を断定しない（「〜と言われています」「〜しやすくなります」）。',
  },
  {
    id: 'reassurance',
    label: '不安をほどく',
    hint: 'お客様が「自分には無理かも」と思っている不安を1つ取り上げ、「実は逆なんです」とやさしく解いて安心を渡す。人・同業・特定の方法は絶対に批判しない。最後は「だから大丈夫ですよ」と背中を押す。',
  },

  // ★2026-08-28追加：予約導線型（Threads上の集客ノウハウ投稿から採用）。
  //   悩みの名指し→信頼の根拠→変化→初回オファー、の順でCVへ運ぶ構成。
  //   出典のノウハウにあった「予約枠に限りあり」等の希少性の煽りは、
  //   検証不能な盛り表現（factGuard禁止）かつ景表法リスクなので不採用。
  //   数字・資格・価格・お客様の声は入力済みの事実のみ使う。
  {
    id: 'reservation_funnel',
    label: '予約導線',
    hint:
      '順番を守って書く。'
      + '(1)悩みを持つ人を名指しする（症状名でなく、その人の生活場面まで具体的に）。'
      + '(2)信頼の根拠を1つだけ（入力情報にある資格・年数・実績のみ。無ければ施術方針を一言）。'
      + '(3)施術名ではなく「受けた後どうなるか」の変化を1つ。'
      + '(4)初回の価格・所要時間が入力情報にあれば示し、試しやすさを伝える（「初回◯円」「◯分」）。'
      + '締めは言い切り。予約の直接の催促や「残り◯枠」「お早めに」等の煽りは絶対に書かない。'
      + '他店・他の方法をダメだったと批判しない（「合わなかった方も」の受け止めはよい）。',
  },

  // ★2026-08-23追加：個人サロン向けの「悩み深掘り」型（三上さん提供の型）。
  //   悩み→原因/勘違い→変わった後→小さな問いかけ、の順で書く。
  //   コメントを取りにいく会話型なので、締めの問いかけは許可される
  //   （autoPostScheduler の CONVERSATION_POST_TYPES に含める）。
  {
    id: 'deep_worry',
    label: '悩み深掘り',
    hint:
      '順番を守って書く。'
      + '(1)お客様の悩みを、その人にしか分からない場面まで具体的に描く'
      + '（「毛穴に悩む人」ではなく「ファンデを塗っても鼻の黒ずみが隠れない」まで落とす）。'
      + '(2)その悩みの原因、またはよくある勘違いを1つだけ伝える。'
      + '(3)施術を受けた後どう変わるかを、施術名ではなく「お客様が手に入れたい状態」で書く'
      + '（「フェイシャル60分」ではなく「すっぴんで人に会えるようになる」）。'
      + '(4)最後は一言で答えられる小さな問いかけで終える。予約は直接促さない。'
      + 'きれいにまとめすぎず、普段お客様に話している言葉のままで書く。',
  },
];

/** id→定義の逆引き */
/**
 * 個人ブランディングモード専用の追加切り口（shared/personalBrand.ts）。
 * 店舗モードの回転には入れない（店舗の発信で「持論」が強すぎると浮くため）。
 */
export const PERSONAL_EXTRA_ANGLES: PostAngle[] = [
  {
    id: 'opinion',
    label: '持論・スタンス',
    hint: '入力情報の「持論・業界の違うと思うこと」から1つ選び、自分の意見として言い切る。攻撃・煽りにせず、理由を1つ添える。意見が入力に無ければ「大事にしていること」を語る。',
  },
  {
    id: 'failure_story',
    label: '失敗談',
    hint: '入力情報にある自分の失敗・遠回りを1つだけ正直に書き、そこから得た学びで締める。武勇伝にしない。入力に失敗談が無ければ原体験の苦労を素材にする。',
  },
  {
    id: 'journey',
    label: '挑戦の途中経過',
    hint: 'いま取り組んでいること・挑戦の途中経過を過程のまま見せる（完成した成果でなくてよい）。入力情報の活動・サービスづくりの文脈で書き、数字や結果を作らない。',
  },
];

const ANGLE_BY_ID = new Map([...POST_ANGLES, ...PERSONAL_EXTRA_ANGLES].map((a) => [a.id, a]));

export function getAngle(id: string | null | undefined): PostAngle | undefined {
  if (!id) return undefined;
  return ANGLE_BY_ID.get(id);
}

/**
 * ◯✕実績から切り口を重み付きランダムで1つ選ぶ。
 * stats: angleId → { good, bad }
 * 重み = 1 + 0.6×◯ − 0.5×✕（下限0.1＝✕が続いた切り口もゼロにはしない。
 * 好みは変わるので、たまに出して再確認できる余地を残す）
 */
export interface AnglePerformance {
  /** 切り口ごとの実測平均インプレッションと母数 */
  perAngle: Record<string, { avgImpressions: number; count: number }>;
  /** 全切り口をならした平均インプレッション（比較の基準） */
  overallAvg: number;
}

/**
 * 実績（実際に何回見られたか）から重みの倍率を出す。
 *
 * 全体平均を1.0として、平均の2倍見られている切り口は最大1.8倍出やすく、
 * 半分以下しか見られていない切り口は最大0.5倍まで出にくくなる。
 * ただし母数が少ないうちは偶然のブレが大きいので、
 * 3件で効き始め、8件で満額になるよう段階的に効かせる。
 */
function performanceMultiplier(angleId: string, perf?: AnglePerformance): number {
  if (!perf || perf.overallAvg <= 0) return 1;
  const p = perf.perAngle[angleId];
  if (!p || p.count < 3) return 1;
  const ratio = p.avgImpressions / perf.overallAvg;
  const confidence = Math.min(1, (p.count - 2) / 6); // 3件=0.17 … 8件=1.0
  const raw = Math.min(1.8, Math.max(0.5, ratio));
  return 1 + (raw - 1) * confidence;
}

/**
 * 切り口の集中検証期間（2026-08-29〜09-11の2週間・三上さん承認）。
 *
 * 15切り口に1日12本が分散すると各切り口のデータが貯まらないため、
 * 期間限定で「検証したい8切り口」だけにローテーションを絞る。
 *   - 新規採用の2つ: reservation_funnel（予約導線）/ deep_worry（悩み深掘り）
 *   - 実測上位6つ: pro_tip 707表示 / misconception 191 / change_story 165 /
 *     customer_voice 157 / surprise_fact 152 / seasonal 132（2026-08-28時点の平均）
 *
 * 期限を過ぎると自動で全切り口のローテーションに戻る（手動の後始末は不要）。
 * 延長・変更するときはこの until とidリストを書き換える。
 */
export const ANGLE_FOCUS: { until: string; ids: readonly string[] } = {
  until: '2026-09-11',
  ids: [
    'reservation_funnel', 'deep_worry',
    'pro_tip', 'misconception', 'change_story',
    'customer_voice', 'surprise_fact', 'seasonal',
  ],
};

/**
 * 現時点で回転対象の切り口（集中検証期間中は絞られる）。
 * mode='personal'（個人ブランディング）は来店・商圏前提の切り口を外し、
 * 持論・失敗談・挑戦の途中経過を加えたプールを使う。
 * ANGLE_FOCUSの集中検証は店舗の実測実験なので個人モードには適用しない。
 */
export function activeAngles(now: number = Date.now(), mode: string = 'store'): PostAngle[] {
  if (mode === 'personal') {
    const EXCLUDED = ['local', 'reservation_funnel'];
    return [
      ...POST_ANGLES.filter((a) => !EXCLUDED.includes(a.id)),
      ...PERSONAL_EXTRA_ANGLES,
    ];
  }
  // 期限はJSTの終日まで有効
  const until = Date.parse(ANGLE_FOCUS.until + 'T23:59:59+09:00');
  if (Number.isFinite(until) && now <= until) {
    const focused = POST_ANGLES.filter((a) => ANGLE_FOCUS.ids.includes(a.id));
    if (focused.length > 0) return focused;
  }
  return POST_ANGLES;
}

export function pickAngle(
  stats: Record<string, { good: number; bad: number }>,
  random: () => number = Math.random,
  perf?: AnglePerformance,
  now: number = Date.now(),
  mode: string = 'store',
): PostAngle {
  const pool = activeAngles(now, mode);
  const weights = pool.map((a) => {
    const s = stats[a.id] ?? { good: 0, bad: 0 };
    // 好み（◯✕）× 結果（実測インプレッション）の掛け合わせ
    const preference = Math.max(0.1, 1 + 0.6 * s.good - 0.5 * s.bad);
    return Math.max(0.05, preference * performanceMultiplier(a.id, perf));
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
