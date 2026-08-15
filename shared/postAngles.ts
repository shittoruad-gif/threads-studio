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
    hint: '地域名や地元の生活感を入り口にして、近所の人に「うちの近くの店だ」と気づいてもらう。入力情報の地域・地元ワードだけを使う。',
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
];

/** id→定義の逆引き */
export function getAngle(id: string | null | undefined): PostAngle | undefined {
  return POST_ANGLES.find((a) => a.id === id);
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

export function pickAngle(
  stats: Record<string, { good: number; bad: number }>,
  random: () => number = Math.random,
  perf?: AnglePerformance,
): PostAngle {
  const weights = POST_ANGLES.map((a) => {
    const s = stats[a.id] ?? { good: 0, bad: 0 };
    // 好み（◯✕）× 結果（実測インプレッション）の掛け合わせ
    const preference = Math.max(0.1, 1 + 0.6 * s.good - 0.5 * s.bad);
    return Math.max(0.05, preference * performanceMultiplier(a.id, perf));
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = random() * total;
  for (let i = 0; i < POST_ANGLES.length; i++) {
    r -= weights[i];
    if (r <= 0) return POST_ANGLES[i];
  }
  return POST_ANGLES[POST_ANGLES.length - 1];
}
