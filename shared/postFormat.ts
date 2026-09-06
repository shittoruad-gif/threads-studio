/**
 * 長い段落をスマホで読める長さに分ける（2026-09-06 三上様「改行ができずギチギチ」の点検から）。
 * 直近7日の自動投稿234件では最長行62字が普通で、1件だけ167字の段落があった。
 * 1行が max 字を超えるときだけ、文末（。！？）で切って改行を入れる。文の途中では切らない。
 */
export function softWrapLongLines(text: string, max = 90): string {
  return String(text ?? '')
    .split('\n')
    .map((line) => {
      if (Array.from(line).length <= max) return line;
      const sentences = line.match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g) ?? [line];
      const out: string[] = [];
      let cur = '';
      for (const s of sentences) {
        if (cur && Array.from(cur + s).length > max) { out.push(cur); cur = s; }
        else cur += s;
      }
      if (cur) out.push(cur);
      return out.join('\n');
    })
    .join('\n');
}
