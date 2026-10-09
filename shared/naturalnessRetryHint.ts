/**
 * 自然さの採点（naturalnessReview）で落ちたときに、次の作り直しへ渡す指示（2026-09-25）。
 *
 * それまでは「不自然と判定された箇所」を並べるだけで、代わりに何を書けばよいかを伝えていなかった。
 * 比嘉様（@haisaiseikotsuin）は 9/24 朝に11回落ち、理由の大半が「どの店でも出せる一般的な文」
 * （季節のあいさつ・「一人ひとりに合わせた施術」）だった。作り直しても同じ型に戻り、3枠を捨てた。
 * 「一般的」と言われたときは、この店を指す言葉（地名・店名・年数・実例）を1つ本文に入れるよう指示する。
 * ガード（採点の基準）は変えない。
 */
const GENERIC_RE = /一般的|どこの|どの店|どの(?:整骨院|整体院|サロン|お店)|個性が(?:薄|な|感じられ)|独自性|ありきたり|汎用/;

export function naturalnessRetryHint(problems: string[], identityHint?: string | null): string {
  const lines = problems.length
    ? problems.map((p) => `- 不自然と判定された箇所：「${p}」`)
    : ["- 店主が自分で打った文に見えない（説明文・汎用の締め）"];
  if (problems.some((p) => GENERIC_RE.test(p))) {
    const id = String(identityHint || "").trim();
    lines.push(
      id
        ? `- どの店でも出せる文になっている。この店を指す言葉（${id}）から1つを本文に入れ、その店で実際にあった場面として書く。季節のあいさつや「一人ひとりに合わせた」で終わらせない。`
        : "- どの店でも出せる文になっている。登録された地名・実績・お客様の実例から1つを本文に入れ、その店で実際にあった場面として書く。季節のあいさつや「一人ひとりに合わせた」で終わらせない。",
    );
  }
  return lines.join("\n");
}

/** 採点の指摘から本文の引用だけを取り出す（「文。- 抽象的で…」の説明部分は外す） */
function quotedPart(p: string): string {
  return String(p ?? "").split(/\s*-\s+/)[0].replace(/^["「『]|["」』]$/g, "").trim();
}

/**
 * 同じ枠でこれまでに落ちた文を、次の作り直しへまとめて渡す（2026-10-09 夜間整備）。
 *
 * 直前の1回分しか渡していなかったため、10/9朝 acc33 slot0 は作り直し・保証パスの6回とも
 * 「セルフマッサージでセルライトは減らない」を言い回しだけ変えて書き、すべて落ちて枠が欠けた。
 * 今回の指摘（current）と重なるものは除く。無ければ空文字。
 */
export function earlierRejectedNote(earlier: readonly string[], current: readonly string[] = []): string {
  const now = new Set(current.map(quotedPart));
  const quotes = Array.from(new Set(earlier.map(quotedPart))).filter((q) => q.length >= 4 && !now.has(q));
  if (quotes.length === 0) return "";
  return [
    "- この枠でこれまでにも不自然と判定された文（言い回しを変えても、同じ話・同じ入り方なら同じ判定になる。この話題から入らず、別の材料で書く）：",
    ...quotes.slice(-6).map((q) => `  ・「${q}」`),
  ].join("\n");
}
