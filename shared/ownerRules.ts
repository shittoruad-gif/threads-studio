/**
 * お客様が自分で足す「書き方の決まり」（2026-10-18 三上様「進めて」）。
 *   手直しの学習（shared/editLessons.ts）は、同じ直しが3回たまるまで決まりにならない。
 *   「うちはこう書く」が最初から分かっている方は、設定画面か公式LINE（「決まり：〜」）で自分で入れられるようにする。
 *   アカウントごとに持ち、生成の最後（手直しの決まりと同じ位置）で渡す。
 *
 * 決めごと
 *  - 1行1つ・最大 maxRules 件・1件 maxLen 字。超えた分は保存しない（長文の貼り付けを決まりにしない）
 *  - 事実（数字・実績・料金・効果）は決まりに入っていても、投稿に持ち込ませない（入力情報だけ）
 */
export const OWNER_RULES = {
  maxRules: 10,
  maxLen: 80,
} as const;

/** 保存文字列（1行1つ）→ 決まりの配列 */
export function parseOwnerRules(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^[\s　]*[-・•*]\s*/, "").trim())
    .filter((s) => s.length > 0 && Array.from(s).length <= OWNER_RULES.maxLen)
    .filter((s, i, a) => a.indexOf(s) === i)
    .slice(0, OWNER_RULES.maxRules);
}

export function serializeOwnerRules(rules: readonly string[]): string {
  return parseOwnerRules(rules.join("\n")).join("\n");
}

/** 「決まり：〜」「決まり 〜」「ルール：〜」→ 決まりの文。合わなければ undefined */
export function parseOwnerRuleMessage(text: string): string | undefined {
  // 「決まり」のあとに区切り（：か空白）が要る（「決まりごとが多い」のような普通の文を拾わない）
  const m = String(text ?? "").trim().match(/^(?:決まり|きまり|ルール)(?:[\s　]*[:：]|[\s　]+)[\s　]*([\s\S]+)$/);
  if (!m) return undefined;
  const body = m[1]!.trim();
  if (!body || Array.from(body).length > OWNER_RULES.maxLen * 3) return undefined;
  return body;
}

export function addOwnerRule(current: string | null | undefined, rule: string): { rules: string[]; added: boolean; reason?: string } {
  const rules = parseOwnerRules(current);
  const r = rule.trim();
  if (Array.from(r).length > OWNER_RULES.maxLen) return { rules, added: false, reason: `1つの決まりは${OWNER_RULES.maxLen}字までです。短く分けて送ってください。` };
  if (rules.includes(r)) return { rules, added: false, reason: "同じ決まりがすでにあります。" };
  if (rules.length >= OWNER_RULES.maxRules) return { rules, added: false, reason: `決まりは${OWNER_RULES.maxRules}件までです。設定画面で整理してから足してください。` };
  return { rules: [...rules, r], added: true };
}

export function removeOwnerRule(current: string | null | undefined, index: number): string[] {
  const rules = parseOwnerRules(current);
  return rules.filter((_, i) => i !== index);
}

/**
 * お客様の書き方の決まり（threadsAccounts.ownerRules）に、呼びかけの地域を市までにする決まりがあるか。
 *   「呼びかけは町名なしで」「Meta AIの質問は岐阜市まで」「呼びかけの地域は市だけ」→ true
 *   ふつうの投稿の決まり（「町名は入れない」だけ）では変えない（呼びかけの話だと分かるものだけ）。
 */
export function isCallAreaRule(r: string): boolean {
  return (
    /(呼びかけ|呼び掛け|meta|メタ|質問)/i.test(r) &&
    (/町名.{0,4}(入れない|いれない|いらない|要らない|不要|なし|無し|無く|なく|外|書かない|省)/.test(r) || /[市区町村](まで|だけ|のみ)/.test(r)));
}

export function callAreaCityOnlyByRules(rules: readonly string[] | null | undefined): boolean {
  return (rules ?? []).some(isCallAreaRule);
}

/** 生成プロンプトの末尾に足す文。決まりが無ければ空。
 *  ★呼びかけ（@meta.ai）の地域の決まりはふつうの投稿の指示に入れない（町名を書かなくなるため・2026-10-22） */
export function buildOwnerRulesNote(rules: readonly string[]): string {
  const list = parseOwnerRules(rules.join("\n")).filter((r) => !isCallAreaRule(r));
  if (list.length === 0) return "";
  return [
    "",
    "",
    "【★このアカウントの方が決めた書き方（ここまでのすべての指示より優先・厳守）】",
    "この方は、自分の投稿の書き方を次のように決めています。毎回この決まりどおりに書いてください。",
    "上の「長さ」「改行の仕方」「絵文字」「問いかけ」の決まりと食い違うところは、この方の決まりに合わせてください。",
    ...list.map((r) => `- ${r}`),
    "事実（数字・実績・料金・効果）は入力情報だけ。決まりの文から事実を持ち込まない。",
  ].join("\n");
}
