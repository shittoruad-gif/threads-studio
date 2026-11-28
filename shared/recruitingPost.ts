/**
 * 求人（採用）の投稿を、集客の投稿と同じ型で書かせないための指示。
 *
 * ★なぜ要るか（2026-09-23 夜間整備・実測）
 *
 * 株式会社プレステージ様（@esthe_prestige_r）は、2晩続けて
 * naturalnessReview で3回落ち、その日の枠を捨てている（＝公開が減っている）。
 * 落ちた下書きは、どれも2行の標語だった：
 *
 *   「エステティシャン、未経験から指名をもらうってすごいこと。／あなたの成長を支えます」
 *   「お客様の『ありがとう』を増やします／美容が好きなら、きっと大丈夫。」
 *   「エステの技術、どうやって覚えるか不安ですか？／プレステージのこだわりは、創業40年の指導。」
 *
 * 材料が足りないわけではない。ご登録の内容はこうなっている。
 *
 *   お客さん像   20～30代女性　エステティシャンに興味がある   ← 応募者
 *   お悩み       エステサロンで働きたい                       ← 悩みではなく希望
 *   N1顧客像     未経験で入社／2か月目に指名／2年で役職者      ← 入社された方の話
 *   お客様の言葉 「スタッフが優しく、サロンの雰囲気も良かった」  ← スタッフの声
 *
 * つまり**求人の投稿**なのに、切り口のカタログ（shared/postAngles.ts）は
 * すべて集客（お客様の悩み → ご来店）むけにできている。
 * そのため毎回「お客様の悩み」を作り話で埋めるか、当たりさわりのない標語に逃げ、
 * 自然さの採点で落ちる、という流れになっていた。
 *
 * ここでは切り口の選び方そのものは変えない（影響が広すぎる）。
 * 求人だと分かったときだけ、**具体的な一人の話で書く**ことを指示に足す。
 * ガードは一切緩めない。
 */

/** 求人の投稿だと判断する手がかり（ご登録の「お客さん像」「お悩み」に出る言葉） */
const RECRUITING_HINTS = [
  "働きたい", "働ける", "求人", "採用", "応募", "入社", "転職", "就職",
  "スタッフ募集", "仲間を募集", "一緒に働く", "未経験から", "正社員", "アルバイト募集",
];

/** ご登録の内容から、求人の投稿かどうかを見分ける */
export function looksLikeRecruiting(project: {
  target?: string | null;
  mainProblem?: string | null;
  n1Customer?: string | null;
} | null | undefined): boolean {
  if (!project) return false;
  // ★「お客さん像」「お悩み」で見る。強み・実績だけに出る「未経験から育てます」で
  //   集客の投稿まで求人扱いにしないため、見る欄を絞る。
  const text = `${project.target ?? ""}\n${project.mainProblem ?? ""}`;
  if (!text.trim()) return false;
  return RECRUITING_HINTS.some((w) => text.includes(w));
}

/**
 * 求人の投稿のときだけプロンプトの末尾に足す指示。
 * 「標語を書かない・実際にあった一人の話をそのまま書く」を求める。
 */
export const RECRUITING_POST_ADDENDUM = `

【この投稿は求人（仲間さがし）です・最優先】
- 読む人は「お客様」ではなく「ここで働くかもしれない人」。来店を促す言い方（ご予約・ご来店・施術を受けに）は書かない。
- ★読んだ人が「これは求人の投稿だ」とすぐ分かるように書く。本文のどこかに、働く人に向けた言葉
  （働く・働き方・職場・募集・入社・応募・スタッフとして など）を必ず入れる。
  お店のメニューや技術の紹介だけで終わり、お客様向けの宣伝に読める投稿は不合格。
- ★標語で終わらせない。「あなたの成長を支えます」「美容が好きならきっと大丈夫」のような、
  どのお店でも書ける励ましの一文だけで組み立てるのは不合格。
- ★登録された事実（働く環境・仕事の中身・お店ごとの違い・待遇・入社された方の話など）から**1つだけ**選び、
  具体的に書く。入社された方の話を使うときは、その人に起きたことを起きた順に書き、誰の話かが分かる具体を残す。
  毎回同じ人の話にしない。
- 給与・待遇・勤務条件は、登録された情報に書かれていなければ書かない。
- 「絶対に稼げる」「必ず成長できる」のような言い切りはしない。`;

/**
 * 求人の投稿だと読んで分かる言葉が入っているか（2026-09-26 三上様指示「今後は求人向けに書いてください」）。
 * ★求人用のアカウントの案が「体質別のケアを40年」のように、お客様向けの宣伝にも読める形になっていた。
 */
const RECRUITING_MARKER = /働|職場|募集|入社|応募|仲間|採用|転職|面談|面接|スタッフとして|エステティシャンとして|エステティシャンへ|エステティシャンに|キャリア|未経験|異業種|役職|賞与|産休|育休/;
export function hasRecruitingMarker(text: string): boolean {
  return RECRUITING_MARKER.test(String(text ?? ""));
}

/**
 * 求人のアカウントで「地元の人に届ける」形をとるお客様（2026-11-22 三上様「倉敷周辺の方にリーチを広げる目的も含めて」→
 * お客様にお伺いして「お任せします」→「これで全て進めて」）。
 *
 *  - 地元の会話（shared/localTalk.ts）は、求人のアカウントでは今まで使っていなかった（looksLikeRecruiting で外す）。
 *    ここに入っている方だけ使う。地元の会話の回は求人の言葉を入れない（読んだ人がプロフィールから募集を知る流れ）。
 *  - それ以外の回は、1行目に地域名を入れるよう指示する（直近で地域名の書き出しが続いたら、R4 が2行目以降へ回す）。
 *  - offerEvery 回に1回だけ「はっきりした募集」（条件2〜3つ→一緒に働きたい理由→質問だけでもDMで）。ほかの回は募集の呼びかけで締めない。
 *  - ほかの求人のお客様（プレステージ様など）は変えない。広げるときは三上様の承諾で userIds に足す（夜間に反映）。
 */
export const RECRUITING_LOCAL = {
  userIds: [32089] as readonly number[],
  // ★2026-11-25 三上様「進めて」：5本に1本 → 2本に1本（はっきりした募集の回）
  offerEvery: 2,
  /** 連携からこの日数までは地元の会話を出さない（慣らし運転で1日1〜2本の間は、全部を求人にする） */
  noLocalTalkDays: 14,
} as const;

/**
 * ★2026-11-25：求人の投稿そのものが「求人っぽくない」と言われた（「倉敷で夜のお仕事に興味があっても…楽しく働ける場所です」）。
 *   募集の一文・具体の条件・応募の入口が無く、お店の紹介にも読めた。ご本人のお手本の文は毎回この3つが入っている。
 *   地元の会話の回以外は、3つとも入っていなければ作り直す（最後の1回は通す＝枠は空けない）。
 */
// ★2026-11-28 お客様「『求人募集してます！』というワードがあると分かりやすい」→「募集」という言葉そのものを必須にする
//   （それまでは「一緒に働きませんか」「スタッフさん」でも通していた）
const RECRUIT_CALL_RE = /募集/;
const RECRUIT_CONDITION_RE = /時給|週\s*[1１一]\s*日|2週間に|２週間に|平日のみ|週末のみ|Wワーク|Ｗワーク|ダブルワーク|掛け持ち|かけもち|Tシャツ|Ｔシャツ|パーカー|ノルマ|無理な営業|お酒が苦手|お酒、?そんなに|お酒が弱|送迎|予定を優先|未経験/;
const RECRUIT_ENTRY_RE = /体験入店|DM|ＤＭ|メッセージ|質問だけ|お問い合わせ|気軽に|気軽な|声をかけて/;

/**
 * 「募集」の一文は毎回入れてもらうので、「直近の投稿と同じ言い回し」の比べからは外す言葉
 * （外さないと、必ず入れる一文そのものが重なりと数えられて枠が見送られる。2026-11-28 下見で確認）。
 */
export const RECRUIT_CALL_STRIP_WORDS: readonly string[] = [
  "スタッフさんを募集しています", "スタッフを募集しています", "スタッフさん募集中です", "スタッフ募集中です",
  "求人募集しています", "求人募集してます", "求人募集中です", "募集しています", "募集してます", "募集中です", "求人募集", "スタッフさん",
];

/** 求人の投稿に足りないもの（足りていれば空） */
export function recruitingLocalMissing(text: string | null | undefined): string[] {
  const t = String(text ?? "");
  const out: string[] = [];
  if (!RECRUIT_CALL_RE.test(t)) out.push("「募集」という言葉が入った一文（「求人募集しています」「スタッフさん募集中です」など）");
  if (!RECRUIT_CONDITION_RE.test(t)) out.push("登録された働く条件を1〜2つ（時給・週の日数・服装・ノルマなし・送迎相談 など、登録にあるものだけ）");
  if (!RECRUIT_ENTRY_RE.test(t)) out.push("気軽な入口を1つ（「体験入店だけでも」「質問だけでもDMで」など）");
  return out;
}

/**
 * ★2026-11-28：登録で「OK」としている条件を、打ち消して書いた投稿が公開された
 *   （登録「お友達同士の応募もOK」→ 投稿「友達と一緒の応募は受け付けておりません。」）。
 *   求人の投稿で「受け付けていない・できない・お断り」と言い切る行は、登録に根拠が無いので行ごと落とす
 *   （「ノルマはありません」「無理な営業はありません」は条件そのものなので残す）。
 */
const RECRUIT_DENIAL_RE = /受け付けて(おりません|いません|ません|ない)|受付して(おりません|いません)|お断り|ご遠慮|できません|出来ません|不可です|NGです|ＮＧです|対象外/;
export function dropRecruitDenials(text: string | null | undefined): { text: string; dropped: string[] } {
  const lines = String(text ?? "").split("\n");
  const dropped: string[] = [];
  const kept = lines.filter((l) => {
    if (RECRUIT_DENIAL_RE.test(l)) { dropped.push(l.trim()); return false; }
    return true;
  });
  if (dropped.length === 0) return { text: String(text ?? ""), dropped };
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), dropped };
}

/**
 * 最後の作り直しでも「気軽な入口」が無いとき、登録された案内の一言（ご本人の登録の言葉）を末尾に足す（2026-11-28）。
 * 文は作らない。登録に入口の一言が無ければ何もしない。
 */
export function appendRecruitEntry(text: string | null | undefined, ctaAssets: readonly unknown[] | null | undefined): string {
  const t = String(text ?? "").trim();
  if (!t || RECRUIT_ENTRY_RE.test(t)) return t;
  const line = (ctaAssets ?? []).map((x) => String(x ?? "").trim()).find((x) => x.length >= 6 && x.length <= 40 && RECRUIT_ENTRY_RE.test(x) && !/https?:/.test(x));
  if (!line) return t;
  return `${t}\n${/[。！!♪♡]$/.test(line) ? line : line + "。"}`;
}

/**
 * 最後の作り直しでも「募集」の言葉が無いとき、1行目に足す一言（2026-11-28 お客様の言葉「求人募集してます！」のまま）。
 */
export const RECRUIT_CALL_LINE = "求人募集してます！";
export function prependRecruitCall(text: string | null | undefined): string {
  const t = String(text ?? "").trim();
  if (!t || RECRUIT_CALL_RE.test(t)) return t;
  return `${RECRUIT_CALL_LINE}\n${t}`;
}

/** 地元の会話を出してよいか：連携から noLocalTalkDays 日までは出さない。それ以降も直近2本に地元の会話があれば出さない（3本に1本まで・2日続けない） */
export function recruitingLocalTalkAllowed(connectDays: number, recentAngles: readonly string[]): boolean {
  if (!(connectDays >= RECRUITING_LOCAL.noLocalTalkDays)) return false;
  return !recentAngles.slice(0, 2).includes("local_talk");
}

export function recruitingLocalFor(userId: number | null | undefined): boolean {
  return RECRUITING_LOCAL.userIds.includes(Number(userId));
}

/** はっきりした募集の回か（日付と枠で決める。1日3本なら5本に1本ほど） */
export function recruitingOfferTurn(postingTimeIndex: number, now: number = Date.now()): boolean {
  const day = Math.floor((now + 9 * 3600_000) / 86400_000);
  return (((day * 3 + Math.max(0, Math.floor(postingTimeIndex))) % RECRUITING_LOCAL.offerEvery) + RECRUITING_LOCAL.offerEvery) % RECRUITING_LOCAL.offerEvery === 0;
}

/** 地元の人に届ける求人の回の指示（地元の会話の回には付けない） */
export function recruitingLocalNote(places: readonly string[], offerTurn: boolean): string {
  const where = places.filter(Boolean).slice(0, 3);
  const head = where.length > 0
    ? `- 読む人は「${where.join("・")}」まわりに住む・働く人。1行目に「${where.join("」「")}」のどれかを自然に入れる（登録に駅の名前があれば「〇〇駅の近く」でもよい）。ただし直近の投稿が続けて地名から始まっているときは、2行目以降に1回だけ入れる。\n`
    : "";
  const must = "- ★求人だとひと目で分かるように、毎回この3つを必ず入れる（どれかが欠けたら不合格）：①「募集」という言葉が入った一文（「求人募集しています」「スタッフさん募集中です」「一緒に働いてくれるスタッフさんを募集しています」など。言い方は毎回変える。できるだけ1〜2行目に置く）②登録された働く条件を1〜2つ（時給・週の日数・服装・ノルマなし・送迎相談 など、登録にあるものだけ。前の投稿と同じ組み合わせにしない）③気軽な入口を1つ（「体験入店だけでも」「質問だけでもDMで」など）。雰囲気や気持ちの話だけで終わらせない。\n";
  const body = must + (offerTurn
    ? "- ★今回は、はっきりした募集の回。①働く人への呼びかけ（地域名を入れる）②登録された条件を2〜3つ ③一緒に働きたい理由を1文 ④「質問だけでも大丈夫なので、DMで声をかけてください」のような気軽な一言、の順で書く。\n"
      + "- ★登録に「オープンしたばかり」のように新しいお店だと分かる事実があれば、今回はそれを必ず1回入れる（「オープンして間もないお店です」「まだ始まったばかりのお店です」など。登録に無ければ書かない）。\n"
    : "- 今回は、登録された条件・お店の雰囲気・働く人の不安への答えのうち1つを中心に書き、上の3つを短く添える。\n");
  const deny = "- 登録された条件を打ち消す文（「〜は受け付けておりません」「〜はできません」「〜はお断り」）は書かない。登録にあるのは「OK」「相談できる」ことだけ。\n";
  const facts = deny + "- 「よく聞かれます」「〜と言われます」のように、実際にあった質問・会話として書かない（登録に無い）。働く人の不安は、読む人の側の気持ちとして書く。\n"
    + "- 「〜でも大丈夫」「〜でも働けます」と言ってよいのは、登録された条件にあることだけ（週1日から・2週間に1回・平日のみ／週末のみ・Wワーク・服装・ノルマなし・お酒が苦手でも相談・送迎相談・体験入店・お友達と応募 など）。登録に無いこと（カラオケが苦手でも 等）は約束しない。\n";
  return `\n\n【地元の人に届ける求人の投稿・最優先】\n${head}${body}${facts}`;
}
