/**
 * 事実ガード（ハルシネーション最終防衛ライン）
 *
 * LLMが「ほぼ常に捏造で、かつ書かれると致命的」な主張を出した場合に、
 * 入力（店舗情報・カウンセリング等）に裏付けが無ければ機械的に除去する。
 *
 * 設計方針：
 *  - 誤検出（正当な文の削除）を避けるため、対象は高精度パターンのみ。
 *  - 「裏付け」＝入力テキスト(supportedFacts)に該当キーワード/数値が含まれること。
 *    含まれていればユーザーの事実なので残す。含まれなければ捏造として文ごと除去。
 *  - 除去で本文が空になる場合は元を残す（投稿崩れ防止）。除去内容は呼び出し側に返す。
 */

const toHalfWidthDigits = (s: string) =>
  s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));

/** 1つの捏造パターン。matchが当たり、evidenceが裏付けに無ければ捏造とみなす。 */
interface Trigger {
  re: RegExp;
  /** この文が正当である条件（裏付けに含まれているべき語/数値）。未指定なら matched 文字列自体。 */
  evidence?: (m: RegExpMatchArray) => string[];
  label: string;
}

const TRIGGERS: Trigger[] = [
  // 希少性・人気の“現在状態”主張（AIには知り得ない＝ほぼ捏造）
  { re: /先着\s*[0-9０-９]*\s*[名様人]?/, label: '先着' , evidence: () => ['先着'] },
  { re: /残り\s*[0-9０-９]+\s*(名|席|枠|組)/, label: '残り枠', evidence: () => ['残り'] },
  { re: /キャンセル待ち/, label: 'キャンセル待ち', evidence: () => ['キャンセル待ち'] },
  { re: /予約(が)?殺到/, label: '予約殺到', evidence: () => ['殺到'] },
  { re: /満員御礼|満席続出/, label: '満員御礼', evidence: () => ['満員', '満席'] },
  { re: /予約の(取れない|取りづらい)/, label: '予約困難', evidence: () => ['予約の取れない', '予約困難'] },
  { re: /行列の(できる|絶えない)/, label: '行列', evidence: () => ['行列'] },
  // 権威・受賞（確証がなければ捏造）
  { re: /日本一|世界一/, label: '日本一/世界一', evidence: (m) => [m[0]] },
  { re: /(地域|業界|エリア|県内|市内)?\s*(No\.?\s*1|ナンバーワン|ＮＯ．?１)/i, label: 'No.1', evidence: () => ['No.1', 'NO.1', 'ナンバーワン', 'no1', 'no.1'] },
  { re: /[0-9０-９]+\s*冠(達成)?/, label: '◯冠', evidence: () => ['冠'] },
  { re: /(受賞|大賞|グランプリ|金賞|優秀賞)/, label: '受賞', evidence: () => ['受賞', '賞', 'グランプリ'] },
  // メディア掲載（確証がなければ捏造）
  { re: /テレビ.{0,4}(出演|放送|紹介|取材|特集)/, label: 'テレビ', evidence: () => ['テレビ', 'TV', 'メディア'] },
  { re: /(メディア|雑誌|新聞|ラジオ).{0,4}(掲載|紹介|出演|取材|特集)/, label: 'メディア掲載', evidence: () => ['メディア', '雑誌', '新聞', 'ラジオ', '掲載'] },
  // 統計・割合（その数値が裏付けに無ければ捏造）
  { re: /(満足度|改善率|リピート率|成功率|完治率)\s*([0-9０-９]+)/, label: '割合主張', evidence: (m) => [toHalfWidthDigits(m[2])] },
  { re: /([0-9０-９]+)\s*[%％]\s*の?\s*(方|人|患者|お客様|顧客|ケース|利用者)/, label: '％主張', evidence: (m) => [toHalfWidthDigits(m[1])] },
];

/** 文区切り（区切り文字は保持して後で連結） */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？\n])/);
}

export interface ScrubResult {
  text: string;
  removed: string[];
}

/**
 * 1つのテキストから、裏付けの無い捏造文を除去。
 * @param allowEmpty true(既定): 全文が捏造なら空文字を返す（短い見出し・CTA・ツリー用）。
 *                   false: 全消えになる場合は元を残す（本文が空になり投稿が壊れるのを防ぐ）。
 */
export function scrubText(text: string, supportedFacts: string, opts?: { allowEmpty?: boolean }): ScrubResult {
  if (!text) return { text, removed: [] };
  const allowEmpty = opts?.allowEmpty !== false;
  const factsHalf = toHalfWidthDigits(supportedFacts).toLowerCase();
  const removed: string[] = [];
  const kept = splitSentences(text).filter((sentence) => {
    const sHalf = toHalfWidthDigits(sentence);
    for (const t of TRIGGERS) {
      const m = sHalf.match(t.re);
      if (!m) continue;
      const evidence = (t.evidence ? t.evidence(m) : [m[0]]).map((e) => e.toLowerCase());
      const backed = evidence.some((e) => e && factsHalf.includes(e));
      if (!backed) {
        removed.push(`${t.label}（「${sentence.trim().slice(0, 30)}…」）`);
        return false; // この文は捏造を含むので除去
      }
    }
    return true;
  });
  const newText = kept.join('').trim();
  // 本文が空になり投稿が壊れる場合だけ元を残す（removed は報告する）。
  if (!newText && text.trim() && !allowEmpty) return { text, removed };
  return { text: newText, removed };
}

export interface GuardedPost {
  title?: string;
  mainPost?: string;
  treePosts?: string[];
  cta?: string;
  [k: string]: unknown;
}

export interface GuardPostResult<T> {
  post: T;
  removed: string[];
}

/** 投稿オブジェクト（title/mainPost/treePosts/cta）をまとめてスクラブ */
export function scrubPost<T extends GuardedPost>(post: T, supportedFacts: string): GuardPostResult<T> {
  const removed: string[] = [];
  const out: any = { ...post };
  // 見出し・CTAは丸ごと捏造なら空にしてよい。本文(mainPost)は空にせず元を残す（投稿崩れ防止）。
  for (const f of ['title', 'cta'] as const) {
    if (typeof out[f] === 'string') {
      const r = scrubText(out[f] as string, supportedFacts, { allowEmpty: true });
      out[f] = r.text;
      removed.push(...r.removed);
    }
  }
  if (typeof out.mainPost === 'string') {
    const r = scrubText(out.mainPost, supportedFacts, { allowEmpty: false });
    out.mainPost = r.text;
    removed.push(...r.removed);
  }
  if (Array.isArray(out.treePosts)) {
    out.treePosts = out.treePosts.map((tp: any) => {
      if (typeof tp !== 'string') return tp;
      const r = scrubText(tp, supportedFacts, { allowEmpty: true });
      removed.push(...r.removed);
      return r.text;
    }).filter((tp: any) => typeof tp !== 'string' || tp.trim().length > 0);
  }
  return { post: out, removed };
}

/** 入力素材を1つの裏付けテキストに結合（string / string[] / null を許容） */
export function buildSupportedFacts(...parts: (string | string[] | null | undefined)[]): string {
  return parts
    .flatMap((p) => (Array.isArray(p) ? p : [p]))
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join('\n');
}
