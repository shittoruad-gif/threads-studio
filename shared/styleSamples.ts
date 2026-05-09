/**
 * スタイル校正用サンプル投稿
 *
 * カウンセリング後にユーザに 6つのサンプル投稿を提示し、
 * 「この雰囲気が好き」を1〜3つ選んでもらう。
 * 選んだサンプルからスタイルの傾向を抽出して
 * projects.stylePreference に保存し、
 * 以降の AI 生成プロンプトに「ユーザはこういう書き方が好き」として差し込む。
 *
 * 設計:
 *  - LLM 呼び出しなしで完結する（プレースホルダ {{businessType}} {{area}} {{target}} を文字列代入）
 *  - 6パターン（gentle / casual / sharp / professional / warm / playful）
 *  - 1パターンあたり3〜5バリエーション → ランダムに6個ピックして提示
 */

export type StyleSampleTone =
  | 'gentle'        // 柔らかく丁寧（共感重視）
  | 'casual'        // カジュアル・親しみやすい
  | 'sharp'         // 断定的・キレ味重視
  | 'professional'  // 専門家らしい落ち着き
  | 'warm'          // 温かみのある語り口
  | 'playful';      // 少し遊び心がある

export interface StyleSample {
  id: string;
  tone: StyleSampleTone;
  toneLabel: string;          // 表示用ラベル（「やわらか共感型」など）
  toneDescription: string;     // ユーザ向け短い説明
  template: string;            // 本文テンプレ（{{...}}を含む）
  length: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'minimal' | 'moderate';
}

const TONE_META: Record<StyleSampleTone, { label: string; description: string }> = {
  gentle: {
    label: 'やわらか共感型',
    description: '丁寧で寄り添う口調。読み手の気持ちを汲む語り。',
  },
  casual: {
    label: 'カジュアル親しみ型',
    description: '友達みたいな話し方。距離を縮める。',
  },
  sharp: {
    label: 'キレ味断定型',
    description: '短く強く言い切る。スクロールを止める。',
  },
  professional: {
    label: '専門家落ち着き型',
    description: '冷静で論理的。プロの説明口調。',
  },
  warm: {
    label: '温かみ語り型',
    description: '物語を聞かせるような、人柄が出る語り口。',
  },
  playful: {
    label: '遊び心ライト型',
    description: '少しユーモアを混ぜる。重く感じさせない。',
  },
};

// ─────────────────────────────────────────────────────────────────────────
// テンプレート集（各 tone × 複数バリエーション）
//   {{businessType}} 業種
//   {{area}} 地域
//   {{target}} ターゲット
//   {{mainProblem}} 主な悩み
//   {{strength}} 強み
// ─────────────────────────────────────────────────────────────────────────
const TEMPLATES: StyleSample[] = [
  // ── gentle（柔らか共感）
  {
    id: 'gentle_1',
    tone: 'gentle',
    toneLabel: TONE_META.gentle.label,
    toneDescription: TONE_META.gentle.description,
    length: 'medium',
    emojiUsage: 'minimal',
    template: `{{mainProblem}}を抱えている方、本当に多いです。

我慢していること、自分のせいだと思ってしまうこと、ありませんか。

{{area}}で{{businessType}}をしていて感じるのは、こうした悩みは「気のせい」ではないということ。
向き合う時間を作るだけで、ふっと変わることがあります。

気になる方はお気軽にご相談ください。`,
  },
  {
    id: 'gentle_2',
    tone: 'gentle',
    toneLabel: TONE_META.gentle.label,
    toneDescription: TONE_META.gentle.description,
    length: 'short',
    emojiUsage: 'none',
    template: `{{target}}の方からのご相談で多いのが「{{mainProblem}}」。

無理しすぎず、まず話を聞かせてください。
合うか合わないかも、一緒に確かめましょう。`,
  },
  {
    id: 'gentle_3',
    tone: 'gentle',
    toneLabel: TONE_META.gentle.label,
    toneDescription: TONE_META.gentle.description,
    length: 'medium',
    emojiUsage: 'minimal',
    template: `「相談していいのかな…」と迷っている方へ。

{{businessType}}に来てくださる方の多くは、最初すごく緊張しています。
「こんなことで来てもいいのか」「忙しいのに迷惑じゃないか」と。

そんなことありません。話してくれる方が、私たちも嬉しいです。`,
  },

  // ── casual（カジュアル親しみ）
  {
    id: 'casual_1',
    tone: 'casual',
    toneLabel: TONE_META.casual.label,
    toneDescription: TONE_META.casual.description,
    length: 'medium',
    emojiUsage: 'moderate',
    template: `{{mainProblem}}、地味にしんどいよね…🥲

「もうしょうがない」って諦めてる人、めっちゃ多いんだけど
ちゃんと向き合えば結構変わる。

{{area}}で{{businessType}}やってます。気軽にDMどうぞ☺️`,
  },
  {
    id: 'casual_2',
    tone: 'casual',
    toneLabel: TONE_META.casual.label,
    toneDescription: TONE_META.casual.description,
    length: 'short',
    emojiUsage: 'minimal',
    template: `「{{mainProblem}}、もう仕方ないよね」って言う{{target}}が多すぎる。

仕方なくない。まじで。
1回だけでも、別のやり方を試してみてほしい。`,
  },
  {
    id: 'casual_3',
    tone: 'casual',
    toneLabel: TONE_META.casual.label,
    toneDescription: TONE_META.casual.description,
    length: 'medium',
    emojiUsage: 'moderate',
    template: `{{businessType}}の中の人、つぶやきます☕

最近の悩みで一番多いのが「{{mainProblem}}」。
で、共通してるのが「自分でなんとかしようとして悪化させた」パターン。

ひとりで抱えなくていいよ〜。`,
  },

  // ── sharp（キレ味断定）
  {
    id: 'sharp_1',
    tone: 'sharp',
    toneLabel: TONE_META.sharp.label,
    toneDescription: TONE_META.sharp.description,
    length: 'short',
    emojiUsage: 'none',
    template: `{{mainProblem}}を放置してる人、多すぎ。

ストレッチでもマッサージでも、その場しのぎでは戻ります。
原因は別のところ。

{{area}}の{{businessType}}が、本気で見ます。`,
  },
  {
    id: 'sharp_2',
    tone: 'sharp',
    toneLabel: TONE_META.sharp.label,
    toneDescription: TONE_META.sharp.description,
    length: 'short',
    emojiUsage: 'none',
    template: `{{target}}に伝えたい。

{{mainProblem}}は、頑張りすぎたサインです。
我慢じゃなくて、ケアの問題。

「忙しいから後で」と言ってるうちに、後がなくなる。`,
  },
  {
    id: 'sharp_3',
    tone: 'sharp',
    toneLabel: TONE_META.sharp.label,
    toneDescription: TONE_META.sharp.description,
    length: 'medium',
    emojiUsage: 'none',
    template: `本気で{{mainProblem}}と向き合いたい人だけ読んでください。

{{strength}}を活かして、原因から見ます。
「なんとなく良くなる」ではなく、「なぜ良くなるか」を一緒に共有します。

ぼんやり通って終わりたい方には、向いていません。`,
  },

  // ── professional（専門家落ち着き）
  {
    id: 'professional_1',
    tone: 'professional',
    toneLabel: TONE_META.professional.label,
    toneDescription: TONE_META.professional.description,
    length: 'long',
    emojiUsage: 'none',
    template: `{{mainProblem}}についてよくいただく質問にお答えします。

「同じ姿勢が続くから」と説明されることが多いですが、実はそれだけが原因ではありません。
{{businessType}}の現場では、原因を 3 つの観点から見ていきます。
姿勢、生活習慣、そしてその方の身体の使い方の癖。

ご自身の状態が気になる方は、まず 30 分のカウンセリングからご案内できます。
{{area}}にてご予約承ります。`,
  },
  {
    id: 'professional_2',
    tone: 'professional',
    toneLabel: TONE_META.professional.label,
    toneDescription: TONE_META.professional.description,
    length: 'medium',
    emojiUsage: 'none',
    template: `{{target}}からのご相談で多いのが「{{mainProblem}}」です。

その背景には、生活習慣やお身体の使い方の癖が関係していることが少なくありません。
当{{businessType}}では、原因を共有したうえでケアの方針を決めるようにしています。

ご相談内容に合わせてご案内いたします。`,
  },

  // ── warm（温かみ語り）
  {
    id: 'warm_1',
    tone: 'warm',
    toneLabel: TONE_META.warm.label,
    toneDescription: TONE_META.warm.description,
    length: 'medium',
    emojiUsage: 'minimal',
    template: `{{businessType}}を始めて、気づいたことがあります。

来てくださる方の多くは、{{mainProblem}}そのものよりも、
「ちゃんと話を聞いてもらえる場所」を探しているのだと。

時間に追われる毎日の中で、自分の体のことを話せる場所は意外と少ない。
だから、ここではゆっくり話してください。`,
  },
  {
    id: 'warm_2',
    tone: 'warm',
    toneLabel: TONE_META.warm.label,
    toneDescription: TONE_META.warm.description,
    length: 'medium',
    emojiUsage: 'minimal',
    template: `朝、{{area}}の通りを歩きながら考えていました。

{{target}}の方々の毎日は、本当に忙しい。
「{{mainProblem}}」と言いながら、結局自分のことは後回しにしてしまう。

それでも、ふとケアの時間を作ったときに、何かが変わる瞬間があります。
そのお手伝いができたら嬉しいです。`,
  },

  // ── playful（遊び心ライト）
  {
    id: 'playful_1',
    tone: 'playful',
    toneLabel: TONE_META.playful.label,
    toneDescription: TONE_META.playful.description,
    length: 'medium',
    emojiUsage: 'moderate',
    template: `{{businessType}}あるある言わせてください💭

「{{mainProblem}}」で来た方の 9 割が、最初こう言います。
「もう年だから」「仕方ないよね」

いやいや、そういう問題じゃないんです🙅‍♂️
体は何歳でも返事してくれます。声をかけてあげるかどうか。

{{area}}にて、お話聞きます。`,
  },
  {
    id: 'playful_2',
    tone: 'playful',
    toneLabel: TONE_META.playful.label,
    toneDescription: TONE_META.playful.description,
    length: 'short',
    emojiUsage: 'minimal',
    template: `{{target}}に告ぐ。

{{mainProblem}}は、放っておくと友達を呼びます。
肩こりが頭痛を呼び、頭痛が不眠を呼び…

早めに連絡くださいね。`,
  },
];

/**
 * 引数の variables を使ってテンプレ内のプレースホルダを差し替える。
 * 値が空ならデフォルト文字列を入れる。
 */
function fillTemplate(template: string, vars: Record<string, string | undefined | null>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key];
    if (v && String(v).trim()) return String(v).trim();
    // デフォルトのフォールバック
    const fallbacks: Record<string, string> = {
      businessType: 'お店',
      area: 'この街',
      target: 'お客様',
      mainProblem: 'お悩み',
      strength: '私たちの強み',
    };
    return fallbacks[key] ?? '';
  });
}

export interface StyleSampleVariables {
  businessType?: string | null;
  area?: string | null;
  target?: string | null;
  mainProblem?: string | null;
  strength?: string | null;
}

/**
 * 全 tone から 1 つずつランダムに 1 サンプルを選び、6 個返す。
 * 各サンプルは projectt の businessType / area / target / mainProblem に
 * 差し替えた状態で返ってくる。
 */
export function generateStyleSamples(vars: StyleSampleVariables, count = 6): StyleSample[] {
  const tones: StyleSampleTone[] = ['gentle', 'casual', 'sharp', 'professional', 'warm', 'playful'];
  const result: StyleSample[] = [];
  for (const t of tones) {
    const candidates = TEMPLATES.filter((s) => s.tone === t);
    if (candidates.length === 0) continue;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    result.push({
      ...pick,
      template: fillTemplate(pick.template, vars as any),
    });
  }
  // 6 件未満なら他のトーンから補充
  while (result.length < count) {
    const all = TEMPLATES.filter((s) => !result.find((r) => r.id === s.id));
    if (all.length === 0) break;
    const pick = all[Math.floor(Math.random() * all.length)];
    result.push({ ...pick, template: fillTemplate(pick.template, vars as any) });
  }
  return result.slice(0, count);
}

/**
 * ID からサンプルメタを取得（保存時に使う）
 */
export function findStyleSampleById(id: string): StyleSample | undefined {
  return TEMPLATES.find((s) => s.id === id);
}

/**
 * 選ばれた id 配列から、ユーザの好みプロファイルを推定する。
 * 全部同じ tone なら確実、混ざっていれば多数決。長さ・絵文字使用も多数決。
 */
export interface StylePreferenceProfile {
  selectedStyleIds: string[];
  summary: string;
  tone: StyleSampleTone;
  length: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'minimal' | 'moderate';
}

export function buildStylePreferenceFromSelection(selectedIds: string[]): StylePreferenceProfile | null {
  const picks = selectedIds.map(findStyleSampleById).filter(Boolean) as StyleSample[];
  if (picks.length === 0) return null;

  const mode = <T extends string>(arr: T[]): T => {
    const counts: Record<string, number> = {};
    for (const x of arr) counts[x] = (counts[x] ?? 0) + 1;
    let best = arr[0];
    let bestN = 0;
    for (const k of Object.keys(counts)) {
      if (counts[k] > bestN) { best = k as T; bestN = counts[k]; }
    }
    return best;
  };

  const tone = mode(picks.map((p) => p.tone));
  const length = mode(picks.map((p) => p.length));
  const emojiUsage = mode(picks.map((p) => p.emojiUsage));

  const summary = picks.length === 1
    ? `「${picks[0].toneLabel}」のような書き方を好む。${picks[0].toneDescription}`
    : `好みのスタイルは「${TONE_META[tone].label}」が中心（選ばれたサンプル: ${picks.map((p) => p.toneLabel).join(' / ')}）。${TONE_META[tone].description}`;

  return {
    selectedStyleIds: picks.map((p) => p.id),
    summary,
    tone,
    length,
    emojiUsage,
  };
}
