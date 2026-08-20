/**
 * リーチ強化の共通ヘルパー
 *  - deriveTopicTag: 店舗情報からトピックタグを決定論的に1つ選ぶ（捏造なし）
 *  - buildFollowUpContent: 追い投稿（6時間後のセルフリプライ）の文面テンプレ
 *  - computeFollowUpTime: 追い投稿の時刻（+6h、深夜は翌朝8時台へクランプ）
 *
 * 前提：利用者はThreads未経験がほとんど。追い投稿の文面は
 * 「宣伝っぽくない・やわらかい・コメントを誘う」トーンに統一する。
 */
import { sanitizeTopicTag } from './threadsPost';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/**
 * 店舗情報からトピックタグを1つ導出。
 * 優先順: 主な悩みの先頭ワード → 業種 → 地域の末尾トークン。
 * すべてユーザー入力済みの事実のみ（AIによる推測はしない）。
 */
export function deriveTopicTag(project: {
  mainProblem?: string | null;
  businessType?: string | null;
  area?: string | null;
}): string | null {
  const firstToken = (s: string | null | undefined): string | null => {
    if (!s) return null;
    const t = s.split(/[、,・\/\s　]+/).map((x) => x.trim()).filter(Boolean)[0] ?? null;
    if (!t) return null;
    const len = Array.from(t).length;
    return len >= 2 && len <= 12 ? t : null;
  };

  // ① 主な悩み（例:「慢性的な肩こり」→「慢性的な肩こり」/「肩こり」）
  const problem = firstToken(project.mainProblem);
  if (problem) return sanitizeTopicTag(problem);

  // ② 業種（括弧書きは除去。例:「美容サロン（エステ）」→「美容サロン」）
  const biz = firstToken((project.businessType || '').split(/[（(]/)[0]);
  if (biz) return sanitizeTopicTag(biz);

  // ③ 地域の末尾トークン（例:「岡山県倉敷市玉島」→「玉島」）
  const areaTok = (project.area || '')
    .split(/[都道府県市区町村]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^[0-9０-９\-]+$/.test(s))
    .pop();
  if (areaTok) return sanitizeTopicTag(areaTok);

  return null;
}

/**
 * 追い投稿の文面。宣伝ではなく「会話のきっかけ」を作る一言。
 * post.id でローテーションして毎回同じにならないようにする。
 */
export function buildFollowUpContent(mainProblem: string | null | undefined, seed: number): string {
  const p = (mainProblem || '').split(/[、,・\/\s　]+/).map((x) => x.trim()).filter(Boolean)[0] || 'お体のこと';
  // ★2026-08-20 実測より：「気軽にどうぞ」型の漠然とした誘いより、
  //   ひとことで答えられる具体的な質問のほうがコメントが付く。
  //   （表示394回の投稿では、追い投稿の「実際の商圏何kmですか」に
  //     「東大阪・布施です」と即答が付いていた）
  //   ポイントは ①主語が読み手自身 ②単語だけで答えられる ③正解がない、の3つ。
  const templates = [
    `ちなみに、${p}が一番つらいのっていつですか？ 朝／夕方／寝る前、どれが多いか一言で教えてください😊`,
    `聞いてみたいのですが、${p}で今いちばん気になっているのはどこですか？ ひとことで大丈夫です🙌`,
    `${p}、これまでに試したことって何かありますか？ 「特にない」でも大丈夫です📝`,
    `よければ教えてください。${p}が気になり始めたのは、どれくらい前からですか？😊`,
  ];
  return templates[Math.abs(seed) % templates.length];
}

/**
 * 追い投稿の予定時刻：投稿の6時間後。
 * ただし深夜早朝（JST 22時〜翌7時台）に落ちる場合は、翌朝8時台に繰り上げる
 * （誰も見ていない時間の追い投稿は意味が薄いため）。
 */
export function computeFollowUpTime(base: Date): Date {
  let t = new Date(base.getTime() + 6 * 60 * 60 * 1000);
  const jstHour = new Date(t.getTime() + JST_OFFSET_MS).getUTCHours();
  if (jstHour >= 22 || jstHour < 8) {
    // 「その時点のJST日付の翌朝8時」に設定（既に0-7時台なら当日8時）
    const jst = new Date(t.getTime() + JST_OFFSET_MS);
    const y = jst.getUTCFullYear(), m = jst.getUTCMonth(), d = jst.getUTCDate();
    const addDays = jstHour >= 22 ? 1 : 0;
    const minute = 5 + (Math.abs(base.getTime()) % 20); // 8:05-8:24 で自然にばらす
    t = new Date(Date.UTC(y, m, d + addDays, 8, minute) - JST_OFFSET_MS);
  }
  return t;
}
