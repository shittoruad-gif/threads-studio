/**
 * 「このお店らしさ」の必須条件（2026-09-08 三上様指示「クライアントが思っている内容に近づける」）。
 *
 * 事実：比嘉先生（はいさい整骨院・八千代市勝田台・開業11年・のべ20万人・沖縄出身）に出た投稿が
 *   「デスクワークで肩が凝る方へ、3秒でできること。…」
 * で、地名も店名も実績も人柄も入っていなかった。安全で自然でも「どこの整骨院でも出せる文」。
 *
 * やること：登録情報から「この店を指す言葉」（店名・市区町村や町名・駅名・実績の数字・出身地など）を
 * 取り出し、投稿に1つも入っていなければ不合格にする。判定は文字列一致なので確実。
 */

const norm = (s: string) =>
  String(s || "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .replace(/[\s　]/g, "");

const REGION_WORDS = ["沖縄", "北海道", "九州", "関西", "関東", "東北", "四国", "地元", "県外", "出身"];

export interface IdentitySource {
  storeName?: string | null;
  area?: string | null;
  localTerms?: string | null;
  proof?: string | null;
  strength?: string | null;
  usp?: string | null;
  counselingResult?: string | null;
}

/** 登録情報から「この店を指す言葉」を取り出す */
export function identityTokens(p: IdentitySource): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => {
    const t = norm(String(s || ""));
    if (Array.from(t).length >= 2) out.add(t);
  };

  add(p.storeName);

  // 地域：都道府県は弱すぎるので除き、市区町村・町名を入れる（「八千代市」「八千代」「勝田台」）
  const area = norm(String(p.area || ""));
  const parts = area.split(/(?<=[都道府県市区町村])/).filter(Boolean);
  for (const part of parts) {
    if (/[都道府県]$/.test(part) && parts.length > 1) continue;
    add(part);
    const bare = part.replace(/[市区町村]$/, "");
    if (Array.from(bare).length >= 2) add(bare);
  }

  for (const t of String(p.localTerms || "").split(/[、,\/／\s　\n]+/)) add(t);

  // 実績の数字（開業11年・業界歴20年・のべ20万人）
  const numSrc = [p.proof, p.strength, p.usp].filter(Boolean).join("\n");
  let cr: any = null;
  try { cr = p.counselingResult ? JSON.parse(p.counselingResult) : null; } catch { cr = null; }
  const crText = cr ? [cr.realProofs, cr.originStory, cr.faq, cr.hoursInfo, cr.brief?.oneLine].flat().filter(Boolean).join("\n") : "";
  const numRe = /(\d+(?:[.,]\d+)?)(万人|万件|年以上|年|人以上|人|件|回|店舗)/g;
  let m: RegExpExecArray | null;
  const numText = norm(numSrc + "\n" + crText);
  while ((m = numRe.exec(numText)) !== null) {
    add(m[0]);
    if (m[2] === "万人") add(m[1] + "万");
  }

  // 駅名（FAQや営業情報に出てくる「〇〇駅」）
  const stRe = /([一-龠々ぁ-んァ-ヶー]{2,8}駅)/g;
  const stText = norm(crText + "\n" + String(p.strength || ""));
  while ((m = stRe.exec(stText)) !== null) add(m[1]);

  // 出身地・地縁（「沖縄出身」など）
  const idText = norm([p.usp, cr?.originStory, cr?.brandVoice].filter(Boolean).join("\n"));
  for (const w of REGION_WORDS) if (idText.includes(w) && w !== "出身") add(w);

  return Array.from(out);
}

export interface IdentityVerdict {
  ok: boolean;
  /** 投稿に入っていた「この店を指す言葉」 */
  found: string[];
  /** 作り直しに渡す助言 */
  hint: string;
}

export function checkIdentity(text: string, p: IdentitySource): IdentityVerdict {
  const tokens = identityTokens(p);
  const body = norm(text);
  const found = tokens.filter((t) => body.includes(t));
  if (tokens.length === 0) return { ok: true, found, hint: "" };
  const examples = tokens.slice(0, 6).join("／");
  return {
    ok: found.length > 0,
    found,
    hint: found.length > 0 ? "" : `- この店を指す言葉が1つも無い。次のどれかを必ず1つ入れる：${examples}`,
  };
}
