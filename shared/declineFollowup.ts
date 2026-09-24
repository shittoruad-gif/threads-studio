/**
 * 見送りが続くお客様を徹底的にフォローする（2026-09-24 三上様指示）。
 *
 * > 「今回みたいな感じで、ユーザーが何度も却下をしているところに関しては、
 * >   徹底的にフォローするようにしてください」
 *
 * 「今回みたいな感じ」＝香取様（9/24 未明）にしたこと：
 *   1. 見送られた投稿の共通点を読み取る（shared/declinedPatterns.ts）
 *   2. 見送った理由をお聞きする（公式LINEのボタン）
 *   3. ホームページを読んで、まだ登録されていない材料（強み・実例・よくある質問・機器・実績）を探す
 *   4. 登録と食い違う数字は入れずに、確認事項として分ける
 *   5. 三上様の承諾を得てから「足すだけ」で反映する（消す・書き換えるはしない）
 *
 * ここでは 3〜5 を仕組みにする。発動は「直近7日にご本人が3回以上見送った」アカウント
 * （2026-09-24 三上様決定）。反映は三上様がLINEで「足す」を押したものだけ（同日決定）。
 * ここにはDBに触れない判断だけを置く。DB・LINE側は server/declineFollowup.ts。
 */

/** 何日さかのぼって数えるか */
export const FOLLOWUP_DAYS = 7;
/** その間に何回見送られたら動くか */
export const FOLLOWUP_MIN_DECLINES = 3;
/** 同じお店の情報に、案を出し直すまでの間隔（日） */
export const FOLLOWUP_COOLDOWN_DAYS = 7;

/** ホームページから拾って「足す」候補にする項目 */
export interface MaterialProposal {
  strength: string[];
  realEpisodes: string[];
  faq: string[];
  menu: string[];
  realProofs: string[];
  /** 登録内容と食い違う点（入れない。三上様・先生への確認事項として出す） */
  discrepancies: string[];
}

export const EMPTY_PROPOSAL: MaterialProposal = {
  strength: [], realEpisodes: [], faq: [], menu: [], realProofs: [], discrepancies: [],
};

/** 案に何件あるか（食い違いは数えない） */
export function proposalSize(p: MaterialProposal): number {
  return p.strength.length + p.realEpisodes.length + p.faq.length + p.menu.length + p.realProofs.length;
}

/** 比べやすくする（空白・句読点を無視） */
function key(s: string): string {
  return String(s ?? "").replace(/[\s　、。,.・「」（）()]/g, "");
}

/** すでに登録にある（ほぼ同じ文がある）ものを外す */
export function dropAlreadyRegistered(items: readonly string[], registered: readonly string[]): string[] {
  const reg = registered.map(key).filter((k) => k.length >= 4);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const s = String(raw ?? "").trim();
    const k = key(s);
    if (k.length < 4 || seen.has(k)) continue;
    if (reg.some((r) => r.includes(k) || k.includes(r))) continue;
    seen.add(k);
    out.push(s.slice(0, 160));
  }
  return out.slice(0, 8);
}

/**
 * 案を、いまのお店の情報に「足すだけ」で合わせる。消す・書き換えるはしない。
 * 戻すときは、返り値の before をそのまま書き戻す。
 */
export function mergeProposal(
  current: { strength: string | null; counselingResult: string | null },
  p: MaterialProposal,
): { strength: string; counselingResult: string; added: number } {
  let cr: Record<string, any> = {};
  try { cr = current.counselingResult ? JSON.parse(current.counselingResult) : {}; } catch { cr = {}; }
  let added = 0;
  for (const k of ["realEpisodes", "faq", "menu", "realProofs"] as const) {
    const cur: string[] = Array.isArray(cr[k]) ? cr[k].map(String) : [];
    const add = dropAlreadyRegistered(p[k], cur);
    cr[k] = [...cur, ...add];
    added += add.length;
  }
  const lines = String(current.strength ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const addS = dropAlreadyRegistered(p.strength, lines);
  added += addS.length;
  return { strength: [...lines, ...addS].join("\n"), counselingResult: JSON.stringify(cr), added };
}

/**
 * 足したものだけを取り除いて「足す前」に戻す（2026-09-24 三上様指示：
 * 「反映した後に『なんかちょっと違うな』となったら、元の状態に戻せるように」）。
 *
 * ★丸ごと書き戻すと、足したあとにお客様ご自身が直した分まで消える。以前はそれを避けるため
 *   「足したあとに更新があれば戻さない」としていたが、それでは戻したいときに戻せない。
 *   足した項目は「足す前の状態」と「案」から mergeProposal と同じ計算で決まるので、
 *   その文だけを今の登録から外す。ほかの行（お客様が足した・直したもの）には触れない。
 */
export function removeProposal(
  current: { strength: string | null; counselingResult: string | null },
  before: { strength: string | null; counselingResult: string | null },
  p: MaterialProposal,
): { strength: string; counselingResult: string; removed: number } {
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
  const cr: Record<string, any> = parse(current.counselingResult);
  const bcr: Record<string, any> = parse(before.counselingResult);
  let removed = 0;
  const strip = (cur: string[], added: string[]) => {
    const drop = new Set(added.map(key));
    const kept = cur.filter((x) => !drop.has(key(x)));
    removed += cur.length - kept.length;
    return kept;
  };
  for (const k of ["realEpisodes", "faq", "menu", "realProofs"] as const) {
    if (!Array.isArray(cr[k])) continue;
    const beforeList: string[] = Array.isArray(bcr[k]) ? bcr[k].map(String) : [];
    cr[k] = strip(cr[k].map(String), dropAlreadyRegistered(p[k] ?? [], beforeList));
  }
  const lines = String(current.strength ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const beforeLines = String(before.strength ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const keptS = strip(lines, dropAlreadyRegistered(p.strength ?? [], beforeLines));
  return { strength: keptS.join("\n"), counselingResult: JSON.stringify(cr), removed };
}

/** LINEで三上様にお送りする案の本文（1通5000字の上限に余裕をもって収める） */
export function proposalMessage(params: {
  userName: string;
  username: string;
  declines: number;
  published: number;
  patterns: string[];
  reasons: string[];
  sourceUrl: string | null;
  proposal: MaterialProposal | null;
  note?: string;
}): string {
  const lines: string[] = [];
  lines.push(`【見送りが続いています】${params.userName}様（@${params.username}）`);
  lines.push(`直近${FOLLOWUP_DAYS}日：見送り${params.declines}回／公開${params.published}件`);
  if (params.patterns.length) lines.push(`見送られた投稿の共通点：${params.patterns.map((x) => `「${x}」`).join("")}`);
  if (params.reasons.length) lines.push(`お聞きした理由：${params.reasons.join("／")}`);
  lines.push("→ 翌朝の生成では、共通点に触れる信条・実績・お手本を外して作ります（自動）。");
  if (params.note) lines.push("", params.note);
  const p = params.proposal;
  if (p && proposalSize(p) > 0) {
    lines.push("", `■ ホームページ（${params.sourceUrl}）から、まだ登録にない材料`);
    const sec = (label: string, arr: string[]) => { if (arr.length) lines.push(`［${label}］`, ...arr.map((x) => `・${x}`)); };
    sec("強み", p.strength);
    sec("実例（場面だけ）", p.realEpisodes);
    sec("よくある質問", p.faq);
    sec("メニュー・機器", p.menu);
    sec("実績", p.realProofs);
    lines.push("", "「足す」を押すと、お店の情報にこのまま足します（今の登録は消しません。「元に戻す」で取り消せます）。");
  }
  if (p && p.discrepancies.length) {
    lines.push("", "■ 登録と食い違う点（入れていません。先生にご確認ください）", ...p.discrepancies.map((x) => `・${x}`));
  }
  return lines.join("\n").slice(0, 4800);
}
