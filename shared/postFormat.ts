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

/** 文末とみなす絵文字（「思います😊一緒に」の😊も区切りにする） */
const EMOJI_RE = new RegExp('\\p{Extended_Pictographic}', 'u');
/** 地の文の字数を数えるときに外す文字（絵文字・つなぎ字・空白） */
const DECOR_RE = new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s]', 'gu');
const DECOR_PUNCT_RE = new RegExp('[\\p{Extended_Pictographic}\\uFE0F\\u200D\\s。！？!?]', 'gu');

/** 1行を文に分ける。「」『』（）の中の ？！ では切らない。文末の後ろの絵文字・閉じかっこは前の文に付ける */
function splitSentences(line: string): string[] {
  const chars = Array.from(line);
  const out: string[] = [];
  let cur = '';
  let depth = 0;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    cur += c;
    if ('「『（('.includes(c)) depth++;
    else if ('」』）)'.includes(c)) depth = Math.max(0, depth - 1);
    // 行頭の「✔️」のような飾りは文末にしない（前に2字以上の地の文があるときだけ）
    const isEnd = depth === 0 && ('。！？!?'.includes(c)
      || (EMOJI_RE.test(c) && Array.from(cur.replace(DECOR_RE, '')).length >= 2));
    if (!isEnd) continue;
    // 続く文末記号・絵文字・異体字セレクタ・閉じかっこはこの文に含める
    while (i + 1 < chars.length && ('。！？!?」』）)️‍'.includes(chars[i + 1]) || EMOJI_RE.test(chars[i + 1]))) {
      cur += chars[++i];
    }
    out.push(cur);
    cur = '';
  }
  if (cur.trim()) out.push(cur);
  // 「つけました？笑」の「笑」のような2字以下の切れ端は前の文につなげる
  return out.reduce<string[]>((acc, s) => {
    const body = Array.from(s.replace(DECOR_PUNCT_RE, ''));
    if (acc.length && body.length <= 2) acc[acc.length - 1] += s;
    else acc.push(s);
    return acc;
  }, []);
}

/**
 * 1つの段落に3文以上、または長い2文が詰まっていたら、文末で1〜2文ずつに分ける（2026-11-07 三上様「改行がうまくいっていない」）。
 * 直近14日の自動投稿の約5%が、70〜85字・3〜4文の1段落で出ていた（90字の歯止めにはかからない長さ）。
 * 文の途中では切らない。2文をつなげるのは合わせて60字以内（改行が1つもない投稿は45字以内）のときだけ（1文ずつ毎回改行にはしない）。
 */
export function breakCrampedParagraphs(text: string, maxPair?: number): string {
  const src = String(text ?? '');
  // もともと改行がある投稿は段落の作りを残す（2文の段落は60字まで）。1行も改行がない投稿だけ細かめに分ける
  const pairLimit = maxPair ?? (src.includes('\n') ? 60 : 45);
  return src
    .split('\n')
    .map((line) => {
      const sentences = splitSentences(line);
      if (sentences.length < 2) return line;
      const out: string[] = [];
      let group: string[] = [];
      for (const s of sentences) {
        if (group.length === 1 && Array.from(group[0] + s).length <= pairLimit) {
          out.push(group[0] + s);
          group = [];
        } else {
          if (group.length) out.push(group[0]);
          group = [s];
        }
      }
      if (group.length) out.push(group[0]);
      return out.join('\n');
    })
    .join('\n');
}
