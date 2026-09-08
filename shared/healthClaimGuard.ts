/**
 * 健康系の断定・体験談・価格連呼のガード（2026-09-06 梅原様のアカウント停止を受けて）。
 *
 * Threads/Instagramは「健康に関する誤情報」「スパム」の自動判定を新しいアカウントに厳しくかける。
 * 実際に停止された @daigo.sekkotsuin の直近投稿には、
 *   「杖なしでスタスタ歩ける方もいます」「朝、痛みなくスッと起き上がれる毎日」「朝までぐっすり眠れて」
 *   「初回お試し1980円」（同日に2回）「5万人以上の実績」
 * が並んでいた。治療の結果を語る体験談と価格の連呼は、人が読めば普通でもAI判定には引っかかる。
 *
 * 対象業種：整体・整骨・接骨・鍼灸・カイロ・エステ・医療・歯科・美容医療・ジム/ピラティス（体の変化を扱う）
 * やること：
 *   1. 結果の断定・体験談（歩ける/眠れる/痛みが消える/治る/完治/改善する 等）を検出
 *   2. 価格訴求（初回◯◯円・お試し◯◯円・◯円引き）を検出（1投稿1回まで・3日に1回まで）
 *   3. 検出したら「言い換え表」で機械的に和らげる。和らげられない文は落とす。
 */
export const HEALTH_BUSINESS_RE = /(整体|整骨|接骨|鍼灸|はり|きゅう|カイロ|エステ|医院|クリニック|歯科|美容皮膚|矯正|リハビリ|ピラティス|ジム|トレーニング|ヨガ|サロン|治療院)/;

export function isHealthBusiness(businessType: string | null | undefined): boolean {
  return HEALTH_BUSINESS_RE.test(String(businessType || ""));
}

/** 結果の断定・治療結果の体験談として引っかかりやすい表現 */
export const OUTCOME_PATTERNS: ReadonlyArray<{ re: RegExp; label: string; fix?: (m: string) => string }> = [
  { re: /杖(なし|無し)で(スタスタ)?歩け(る|た|ます)/g, label: "歩行回復の体験談", fix: () => "歩きやすくなったと話す方もいます" },
  { re: /痛み(が|も)?(なく|無く|消え|取れ|なくな)[^。\n]*/g, label: "痛みの消失", fix: () => "楽に感じる方もいます" },
  { re: /(ぐっすり|朝まで|よく)?(眠れ|寝られ|寝れ)[^。\n]*/g, label: "睡眠改善の体験談", fix: () => "眠りが変わったと話す方もいます" },
  { re: /\d+\s*(ヶ|か|カ|ケ)?月で[^。\n]*/g, label: "期間つきの結果", fix: () => "" },
  { re: /(不眠|頭痛|めまい|しびれ|便秘)(が|も)(改善|解消|なくな|楽にな|良くな)[^。\n]*/g, label: "症状の改善断定", fix: () => "楽に感じる方もいます" },
  { re: /(治る|治り|治し|治せ|完治|根治|根本改善|改善します|改善する|改善した|良くなります|良くなる|効きます|効く)/g, label: "治る・改善の断定", fix: () => "ケア" },
  // ★2026-09-08 @haisaiseikotsuin の公開3件がThreads側で削除された。承認待ちだった投稿は
  //   「つらい症状から解放された！」「眠りが変わった！」「睡眠の質の向上も感じていただけた」で、
  //   上のどの型にも当てはまらず素通りしていた（「眠れ」ではなく「眠り」、「不眠が改善」ではなく
  //   「症状から解放」だったため）。実際に消された投稿の言い回しで型を足す。
  { re: /(症状|痛み|つらさ|辛さ|不調)(から|が)?[^。\n]{0,6}(解放|解消|抜け出|おさらば)[^。\n]*/g, label: "症状からの解放", fix: () => "楽に感じると話す方もいます" },
  { re: /(睡眠|眠り)(の)?(質|深さ)[^。\n]*(向上|上がっ|良くな|改善|変わ)[^。\n]*/g, label: "睡眠の質の改善", fix: () => "休めていると話す方もいます" },
  { re: /(眠り|寝つき|寝起き)(が|も)[^。\n]{0,6}(変わ|良くな|楽にな|深くな)[^。\n]*/g, label: "睡眠改善の体験談", fix: () => "休めていると話す方もいます" },
  { re: /(長年|何年も|ずっと)[^。\n]{0,12}(悩まされ|苦しんで)[^。\n]{0,20}(解放|改善|良くな|楽にな|治)[^。\n]*/g, label: "長年の悩みが解決した体験談", fix: () => "" },
  { re: /(体験|実感)して(くださ|いただ)[^。\n]*(解放|改善|治|良くな)[^。\n]*/g, label: "効果の実感の断定", fix: () => "" },
  // ★不安を煽る予告の言い切り（「そのままにすると秋に3つの不調が出ます」2026-09-08）。
  //   結果の断定の裏返しで、医学的根拠の無い予言になる。
  { re: /(不調|症状|痛み|しびれ|こり|ゆがみ|歪み)(が|も|は)[^。\n]{0,8}(出ます|出る|出てきます|出てしまいます|起きます|起こります|悪化します|進みます|広がります)/g, label: "症状の予告断定", fix: () => "" },
  { re: /(必ず|絶対|確実に|100%|誰でも)[^。\n]{0,12}(楽|良く|改善|変わ|効)/g, label: "保証表現", fix: () => "" },
  { re: /(ヘルニア|坐骨神経痛|自律神経失調|うつ|糖尿|高血圧|がん|癌)[^。\n]{0,10}(治|改善|完治|解消)/g, label: "疾患名＋治癒", fix: () => "" },
  // ★2026-09-09 廿日市の整体院で「15年の経験で、不妊の悩みから妊娠出産されたお客様がいます」が
  //   作られていた（たまたま公開前に止まっていた）。不妊・妊娠は医療の領域で、施術の結果として
  //   語ると医療広告の規制にも、Threads側の健康の誤情報の判定にも当たる。
  //   上のどの型にも入っていなかった（「不眠」はあるが「不妊」は無い）。
  { re: /(不妊|妊活)[^。\n]{0,14}(妊娠|出産|授かっ|授かり|できまし|叶っ|恵まれ)[^。\n]*/g, label: "不妊・妊娠の結果", fix: () => "" },
  { re: /(妊娠|出産|授かり)[^。\n]{0,10}(しやすい|できる|できます|につながる|に導く|を叶え)[^。\n]*/g, label: "妊娠しやすさの断定", fix: () => "からだを整えるお手伝いをしています" },
];

export const PRICE_RE = /(初回|お試し|体験|限定|今だけ|キャンペーン)[^。\n]{0,12}?(\d{1,3}(,\d{3})*|\d+)\s*円|(\d{1,3}(,\d{3})*|\d+)\s*円(引き|OFF|オフ)/g;

export interface ClaimVerdict {
  ok: boolean;
  hits: string[];
  /** 和らげたあとの本文（ok=false でも返す。空なら公開しない） */
  text: string;
  priceMentions: number;
}

/**
 * 引っかかった表現を含む「文」を丸ごと落とす。
 *
 * ★以前は文の途中だけを言い換え表で差し替えていたため、日本語が壊れていた。
 *   例：「それが今回、つらい症状から解放された！って実感してくださったんですよ。」
 *   →「それが今回、つらい楽に感じると話す方もいます。」（「つらい」が残る）
 *   お客様に出る文章なので、中途半端に繕うより、その文を落として
 *   残りの自然な文だけを残すほうが安全（2026-09-08 @haisaiseikotsuin の件）。
 */
function dropSentencesMatching(text: string, re: RegExp): { text: string; dropped: boolean } {
  let dropped = false;
  const lines = String(text).split("\n").map((line) => {
    // 「。」「！」「？」で切って、区切り文字は前の文に残す
    const parts = line.match(/[^。！？!?]*[。！？!?]|[^。！？!?]+/g) ?? [];
    const kept = parts.filter((s) => {
      re.lastIndex = 0;
      const hit = re.test(s);
      re.lastIndex = 0;
      if (hit) dropped = true;
      return !hit;
    });
    // ★落とした文の続き（「〜！」で切れた後ろ半分）が、助詞から始まる断片として残ることがある。
    //   例：「つらい症状から解放された！」を落として「って実感してくださったんですよ。」だけ残る。
    //   宙に浮いた言い出しは意味をなさないので、あわせて落とす。
    const cleaned: string[] = [];
    for (let i = 0; i < kept.length; i++) {
      const s = kept[i];
      const isOrphan = /^[\s　]*(って|とか|と、|など|けど|でも、|それが|そんな)/.test(s) && kept.length !== parts.length;
      if (isOrphan && i > 0) { dropped = true; continue; }
      cleaned.push(s);
    }
    return cleaned.join("");
  });
  return { text: lines.join("\n"), dropped };
}

export function checkHealthClaims(text: string, opts: { allowPrice?: boolean } = {}): ClaimVerdict {
  const hits: string[] = [];
  let out = String(text ?? "");
  for (const p of OUTCOME_PATTERNS) {
    p.re.lastIndex = 0;
    if (p.re.test(out)) {
      p.re.lastIndex = 0;
      const r = dropSentencesMatching(out, p.re);
      if (r.dropped) hits.push(p.label);
      out = r.text;
    }
    p.re.lastIndex = 0;
  }
  const prices = out.match(PRICE_RE) ?? [];
  if (prices.length > 0 && !opts.allowPrice) {
    hits.push("価格訴求");
    // 価格の行ごと落とす（「初回1980円。」のような1文）
    out = out.split("\n").filter((l) => !PRICE_RE.test(l) || (PRICE_RE.lastIndex = 0, false)).join("\n");
    PRICE_RE.lastIndex = 0;
  }
  // 空になった文・二重句読点・空行の連続を整える
  out = out
    .replace(/[、,]\s*[。．]/g, "。")
    .replace(/。{2,}/g, "。")
    .replace(/^[、。]\s*/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { ok: hits.length === 0, hits, text: out, priceMentions: prices.length };
}
