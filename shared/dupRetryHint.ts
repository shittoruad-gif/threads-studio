/**
 * 「直近の投稿と同じ言い回し」で作り直すときに、次の回へ渡す指示。
 *
 * ★前の回でも同じ言い回しで落ちていたら、その言い回しも残して渡す（2026-10-09 夜間整備）。
 *   以前は最後の1つだけを渡していたため、10/9朝 Moveact玉島（acc10）の学習の枠で
 *   1回目「初心者からアスリートまで」→2回目「体が硬いからピラティスは無理って」→3回目「運動初心者からアスリートまで」と、
 *   2回目で伝えなかった1回目の言い回しへ戻り、3回とも落ちて枠ごと見送りになった（金光 acc12 も同じ形）。
 */
const HEAD = "- 直近の投稿と同じ言い回しを使っている。同じことを言うなら、別の入り方・別の言葉にする。次の言い回しはどれも使わない：";

export function dupRetryHint(prevHint: string | null | undefined, dup: string): string {
  const prev = String(prevHint ?? "");
  const phrases: string[] = [];
  if (prev.startsWith(HEAD)) {
    for (const m of Array.from(prev.matchAll(/「([^」]+)」/g))) phrases.push(m[1]);
  }
  // 言い回しの中のかぎかっこは外す（区切りと混ざって前の回の言い回しを読み違えないように）
  const d = String(dup).replace(/[「」]/g, "");
  if (d && !phrases.includes(d)) phrases.push(d);
  return HEAD + phrases.map((p) => `「${p}」`).join("・");
}
