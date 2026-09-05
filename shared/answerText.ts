/**
 * カウンセリングの自由記入をあつかう小さな道具。
 *
 * counseling.ts と counselingBrief.ts の両方から使うため、独立させている
 * （2ファイルが互いを import し合うのを避けるため）。
 */

/** 「なし」等の実質的な空回答を判定する */
export function isEmptyAnswer(value: string): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.length === 0) return true;
  return /^(なし|ありません|無し|無|none|n\/a|na|特になし|思いつかない)$/i.test(trimmed);
}

/** 複数行・読点区切りの回答を配列にする */
export function splitToList(value: string): string[] {
  if (isEmptyAnswer(value)) return [];
  return value
    .split(/\r?\n|、|・|;|；/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // 先頭の箸書き記号と「1.」「2)」のような番号だけを落とす。
    // ★数字そのものは落とさない：「4代目」→「代目」「12年営業」→「年営業」になっていた（2026-09-06）。
    .map((s) => s.replace(/^(?:[-・*•]+|\d+[.)）:：]|[(（]\d+[)）])\s*/, ''))
    .filter((s) => s.length > 0);
}
