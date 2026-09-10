/**
 * 「登録された口調」と矛盾する文を機械的に見つける（2026-09-08 三上様指示「二度と不自然な日本語を出さない」）。
 *
 * 事実：比嘉先生（はいさい整骨院）は口調を「敬語で落ち着いた口調、沖縄出身でゆったりとした口調」と
 * 登録していたのに、生成された投稿は
 *   「肩こりや腰痛、自律神経の乱れなど、心当たり？」
 *   「スッキリ整えるお手伝いをしていますよ😊」
 * だった。既存の品質ガード（shared/jpQualityGuard.ts）は「んです」の回数や絵文字の増減しか見ないので、
 * この種の不自然さは素通りしていた。
 *
 * ここでの判定は「人間はこう書かない」ではなく「登録内容と矛盾している」。
 * 根拠がお客様の登録そのものなので、誤検知の説明がつく。
 */

const EMOJI_SRC =
  '(?:[\\u2600-\\u27BF\\u2728\\u2757\\u2049\\u203C]|\\uD83C[\\uDF00-\\uDFFF]|\\uD83D[\\uDC00-\\uDEFF]|\\uD83E[\\uDD00-\\uDFFF])\\uFE0F?';

/** 登録された口調が「敬語・丁寧・落ち着いた」系か */
export function isPoliteVoice(brandVoice: string | null | undefined): boolean {
  return /(敬語|丁寧|落ち着|です・ます|ですます|上品|誠実|真面目)/.test(String(brandVoice || ""));
}

/**
 * 登録された口調が「フレンドリー・親しみ」系か。
 * 「丁寧な敬語＋少しフレンドリー」のように敬語と併記される登録が一番多い（契約中7名のうち4名・2026-09-11実測）。
 */
export function isFriendlyVoice(brandVoice: string | null | undefined): boolean {
  return /(フレンドリー|親しみ|明るく|明るい|元気|カジュアル|やわらか|柔らか|優し|やさし|気さく|あたたか|温か)/.test(
    String(brandVoice || ""),
  );
}

/** 相手が答えられる質問になっている印（疑問詞） */
const INTERROGATIVE_RE = /(どこ|どちら|どれ|いつ|なに|何|なん|どんな|どの|だれ|誰|いくら|いくつ|どう|なぜ|どっち)/;

/**
 * 名詞や一語で切る問いかけ（「心当たり？」「本当？」）。
 * 文末が「？」で、本体が6文字以下、かつ述語（です・ます・か・でしょう など）で終わっていないもの。
 * 「どうですか？」「大丈夫ですか？」は述語があるので通す。
 *
 * ★疑問詞がある短い問いかけは通す（2026-09-11）。
 *   「もし着物で海外へ行くなら、どこへ？」が読点の後ろだけを見て「どこへ」＝断片と判定され、
 *   岩根様の枠が作り直しになっていた。ルールの狙いは「名詞で切って何を聞かれているか分からない」形を
 *   止めることで、疑問詞があれば相手は答えられる（採点側の「4以上にしてよい例」とも一致する）。
 */
export function findFragmentQuestions(text: string): string[] {
  const out: string[] = [];
  const parts = String(text || "").match(/[^。！？!?\n]*[？?]/g) ?? [];
  for (const raw of parts) {
    const body = raw.replace(/[？?]+$/, "").replace(/^[\s　、,]+/, "").trim();
    // 「〜など、心当たり？」のように読点で区切られていれば、最後の句だけを見る
    const last = body.split(/[、,]/).pop()!.trim();
    if (!last || Array.from(last).length > 6) continue;
    if (/(です|ます|ますか|ですか|でしょう|でしょうか|ません|ませんか|ますよね|かな|のか|るか|たか)$/.test(last)) continue;
    if (INTERROGATIVE_RE.test(last)) continue;
    out.push(raw.trim());
  }
  return out;
}

/**
 * 敬語で登録したお店に出てはいけない砕けた締め。
 * 「〜だね」「〜だよ」「〜かな」「〜でしょ」で行が終わる形。です・ます が崩れている。
 */
export function findCasualClosers(text: string): string[] {
  const re = new RegExp("(だね|だよ|かな|でしょ)\\s*" + EMOJI_SRC + "?\\s*$", "gm");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || ""))) !== null) out.push(m[0].trim());
  return out;
}

/**
 * です・ます は保ったまま、あたたかく崩した締め（「〜していますよ😊」）。
 *
 * ★「敬語で落ち着いた口調」だけを登録した比嘉先生には合わないが、
 *   「丁寧な敬語＋少しフレンドリー」と登録した方には合う（2026-09-11）。
 *   区別せず全部落としていたため、9/10は氷見様・プレステージ様の枠が
 *   2回続けて同じ理由で落ちていた（作り直しても同じ形が出る＝指示と検査が矛盾している）。
 */
export function findWarmClosers(text: string): string[] {
  const re = new RegExp("((?:ます|です|います|ました)よ)\\s*" + EMOJI_SRC + "?\\s*$", "gm");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(text || ""))) !== null) out.push(m[0].trim());
  return out;
}

export interface VoiceVerdict {
  ok: boolean;
  reasons: string[];
}

/**
 * 登録された口調と矛盾していないかを検査する。
 * 断片の問いかけは口調に関わらず不合格（誰の投稿でも読み手に伝わらない）。
 * 砕けた締めは、敬語で登録しているお店だけ不合格。
 */
export function checkVoice(text: string, brandVoice: string | null | undefined): VoiceVerdict {
  const reasons: string[] = [];
  const frags = findFragmentQuestions(text);
  if (frags.length > 0) reasons.push(`一語で切る問いかけ「${frags[0]}」`);
  if (isPoliteVoice(brandVoice)) {
    const casual = findCasualClosers(text);
    if (casual.length > 0) reasons.push(`敬語の登録なのに砕けた締め「${casual[0]}」`);
  }
  return { ok: reasons.length === 0, reasons };
}
