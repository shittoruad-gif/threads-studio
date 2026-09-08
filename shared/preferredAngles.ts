/**
 * はじめの設定「どんな投稿を多めに作りましょうか」（preferredTypes）を、切り口の重みに反映する
 * （2026-09-08 三上様指示。登録してもらっているのに、切り口選びに一切使われていなかった）。
 *
 * preferredTypes は id（local / proof / …）で入ることも、LINEの設定では
 * 表示名（「地元ネタ型」「実績・体験談型」）のまま入ることもあるので、両方を受ける。
 */
import { OUTCOME_RISK_ANGLES } from "./postAngles";

const BY_ID: Record<string, string[]> = {
  local: ["local"],
  proof: ["number_result", "change_story", "customer_voice"],
  empathy: ["deep_worry", "aruaru", "reassurance"],
  story: ["personality", "lesson", "behind_scenes"],
  expertise: ["pro_tip", "misconception", "surprise_fact"],
  qa: ["qa"],
  hook_tree: ["surprise_fact", "misconception"],
  list: ["pro_tip"],
  aruaru: ["aruaru"],
  pinned: [],
};

const LABEL_TO_ID: Array<[RegExp, string]> = [
  [/地元/, "local"],
  [/実績|体験談/, "proof"],
  [/共感/, "empathy"],
  [/ストーリー|物語/, "story"],
  [/専門/, "expertise"],
  [/Q\s*&\s*A|Ｑ＆Ａ|質問/i, "qa"],
  [/常識|逆説/, "hook_tree"],
  [/選|リスト/, "list"],
  [/あるある/, "aruaru"],
  [/固定/, "pinned"],
];

export function normalizePreferredTypes(raw: string[] | string | null | undefined): string[] {
  const items = Array.isArray(raw) ? raw : String(raw || "").split(/[,、\n\s]+/);
  const out: string[] = [];
  for (const it of items) {
    const s = String(it || "").trim();
    if (!s) continue;
    if (BY_ID[s]) { if (!out.includes(s)) out.push(s); continue; }
    const hit = LABEL_TO_ID.find(([re]) => re.test(s));
    if (hit && !out.includes(hit[1])) out.push(hit[1]);
  }
  return out;
}

/**
 * 希望の型 → 優先する切り口の id。
 * 健康系の新しいアカウント（excludeOutcomeAngles）では、結果を語る切り口を外し、
 * 「実績・体験談型」は「数字・実績」だけに寄せる。
 */
export function preferredAngleIds(
  raw: string[] | string | null | undefined,
  opts: { excludeOutcomeAngles?: boolean } = {},
): string[] {
  const ids = normalizePreferredTypes(raw);
  const out: string[] = [];
  for (const id of ids) {
    for (const a of BY_ID[id] ?? []) {
      if (opts.excludeOutcomeAngles && OUTCOME_RISK_ANGLES.includes(a)) continue;
      if (!out.includes(a)) out.push(a);
    }
  }
  return out;
}
