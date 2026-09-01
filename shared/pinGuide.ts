/**
 * 固定投稿を「Threads側でピン留めする」ご案内。
 *
 * ★重要: 固定投稿は、作っただけでは何も起きない。
 *   Threadsのプロフィール最上部に固定（ピン留め）して、はじめて集客の入口になる。
 *   ここが抜けていると「固定投稿を作ったのに効果がない」ということになる。
 *
 * ★ピン留めは Threads の API では操作も確認もできない（提供されていない）。
 *   そのため、アプリから自動で留めることはできず、ご本人にThreadsアプリで
 *   操作していただくしかない。完了したかどうかも、ご本人の申告で持つ。
 *
 * 文面はこの1か所にまとめる（LINE・メール・アプリ画面・自動応答で同じものを使う）。
 */

/** なぜピン留めが要るのか（1〜2文） */
export const PIN_WHY =
  "固定投稿は、Threadsのプロフィールの一番上に固定して、はじめて集客の入口になります。作っただけでは、他の投稿と一緒に流れていってしまいます。";

/** 手順（順番どおり） */
export const PIN_STEPS: string[] = [
  "Threadsアプリを開き、右下のアイコンから自分のプロフィールを表示します",
  "ピン留めしたい投稿（Threads Studioで作った固定投稿）を探します",
  "その投稿の右上にある「…」をタップします",
  "「プロフィールにピン留め」を選びます（英語表示の場合は Pin to profile）",
  "プロフィールの一番上にその投稿が表示されれば完了です",
];

/** 補足（知っておくと迷わないこと） */
export const PIN_NOTES: string[] = [
  "ピン留めできる投稿は1つだけです。別の投稿をピン留めすると、前のものは自動で外れます",
  "ピン留めはThreadsアプリ側の操作です。Threads Studioからは行えません（Threadsが外部からの操作に対応していないため）",
  "内容を作り直したときは、新しい投稿をあらためてピン留めしてください",
];

/** LINE・メール本文用のプレーンテキスト */
export function pinGuideText(): string {
  return (
    `${PIN_WHY}\n\n` +
    "【ピン留めのしかた】\n" +
    PIN_STEPS.map((s, i) => `${i + 1}. ${s}`).join("\n") +
    "\n\n" +
    PIN_NOTES.map((n) => `※ ${n}`).join("\n")
  );
}

/** メール用のHTML */
export function pinGuideHtml(): string {
  const steps = PIN_STEPS.map(
    (s, i) =>
      `<li style="margin:0 0 6px;font-size:14px;color:#334155;line-height:1.7;">${s}</li>`,
  ).join("");
  const notes = PIN_NOTES.map(
    (n) => `<li style="margin:0 0 4px;font-size:12px;color:#64748b;line-height:1.7;">${n}</li>`,
  ).join("");
  return (
    `<p style="margin:0 0 12px;font-size:15px;color:#334155;line-height:1.8;">${PIN_WHY}</p>` +
    `<p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#0f172a;">ピン留めのしかた</p>` +
    `<ol style="margin:0 0 12px;padding-left:20px;">${steps}</ol>` +
    `<ul style="margin:0;padding-left:18px;list-style:none;">${notes}</ul>`
  );
}
