/**
 * 朝のまとめ通知（7:40）と一緒に、その日だけ全員へ送るお知らせ（2026-09-09 三上様指示
 * 「どのようにアップデートされて、どれだけ簡単になったかが分かるものを、ド素人でも分かる文章で」）。
 *
 * ・sendOn の日（JST）にだけ送る。1人1回（users.lastAnnouncementKey に key を記録）
 * ・案内OFF（nextActionNotifyEnabled=0）の方には送らない（対象者の抽出が同じ）
 * ・文面は scripts/ops/announcements/ にも同じものを置く（人が読む控え）
 */
/** 受け取る方の状況（当てはまる段落だけを出すために使う） */
export interface AnnouncementContext {
  /** 1日の自動投稿の上限（0＝自動投稿の無いプラン） */
  maxPerDay: number;
  /** 公開前の確認をしている */
  requireApproval: boolean;
  /** Meta AI呼びかけ文をONにしている */
  metaAiEnabled: boolean;
}

export interface AnnouncementSection {
  text: string;
  /** 省略時は全員に出す */
  when?: (ctx: AnnouncementContext) => boolean;
}

export interface DailyAnnouncement {
  key: string;
  /** YYYY-MM-DD（JST）。この日だけ送る */
  sendOn: string;
  /** 全員共通の文（sections があれば、その前後に付く head／tail として使う） */
  text: string;
  /** 受け取る方に当てはまる段落だけを出す（2026-09-10 三上様指示「各ユーザーに当てはまる内容を」） */
  sections?: AnnouncementSection[];
  tail?: string;
}

/** その方に当てはまる段落だけを番号を振り直してつなぐ */
export function renderAnnouncement(a: DailyAnnouncement, ctx: AnnouncementContext): string {
  if (!a.sections || a.sections.length === 0) return a.text;
  const parts = a.sections.filter((sec) => !sec.when || sec.when(ctx)).map((sec, i) => sec.text.replace(/^■ \d+\. /, `■ ${i + 1}. `));
  return [a.text, ...parts, a.tail].filter(Boolean).join("\n\n");
}

export const DAILY_ANNOUNCEMENTS: readonly DailyAnnouncement[] = [
  {
    key: "easy_setup_2026-09-09",
    sendOn: "2026-09-09",
    text:
      "【お知らせ】設定がぐっと簡単になりました\n\n" +
      "いつもThreads Studioをご利用いただきありがとうございます。\n" +
      "昨夜のアップデートで、はじめての方でも迷わず「毎日の自動投稿」まで進めるように作り直しました。何が変わったかをお伝えします。\n\n" +
      "★ すでに設定（20問）がお済みの方は、何もしなくて大丈夫です。答え直す必要はありませんし、5問からやり直すこともありません。今までの登録内容はそのまま使われます。\n\n" +
      "■ 1. これから登録する方は、最初の質問が「20問」から「5問」になりました\n" +
      "お店の種類・場所・お店の名前・来てほしいお客さん・そのお客さんのお悩み。この5つだけ答えれば、登録は終わりです（2分ほど）。\n" +
      "残りの質問は、投稿が動き始めてから「きょうの1問」として少しずつお聞きします（すでに全部お答えの方には出ません）。答えるほど、投稿がお店らしくなっていきます。\n\n" +
      "■ 2. 答え終わると、その場で最初の投稿が届きます\n" +
      "「本当に動くのかな」を待たずに確かめられます。届いた投稿は「これで投稿する」を押すだけで公開されます。\n\n" +
      "■ 3. やることは、いつも「1つ」だけ\n" +
      "このLINEの「次にやること」を押すと、いま必要なことが1つだけ、ボタンつきで出ます。順番に押していけば、自動投稿まで進みます。\n" +
      "固定投稿・ご案内先のURL・プロフィールの整えは、投稿が動き始めてからで大丈夫です。\n\n" +
      "■ 4. 投稿の「自分らしさ」を1タップで伝えられます\n" +
      "投稿を承認した直後に「◯ 自分らしい」「✕ 違う」が出ます。押すだけで、翌日からの投稿が好みに寄っていきます。\n" +
      "ご自身で直した文章も、次からお手本になります。\n\n" +
      "■ 5. 困ったら、このLINEに文章で送ってください\n" +
      "使い方でも、要望でも、そのまま送っていただければお答えします。自動で答えられないものは、担当者がこのトークでお返事します。\n\n" +
      "まだ設定の途中の方は、このあと届く「次にやること」から、1つずつ進めてみてください。",
  },
  {
    key: "morning_digest_2026-09-11",
    sendOn: "2026-09-11",
    text:
      "【お知らせ】朝の案内を1通にまとめました\n\n" +
      "いつもThreads Studioをご利用いただきありがとうございます。\n" +
      "今日から、朝のLINEが少し変わります。設定や投稿の中身は何も変わりませんので、ご安心ください。",
    sections: [
      {
        when: (c) => c.maxPerDay > 0 && c.requireApproval,
        text:
          "■ 1. 朝の案内は、この1通だけになりました\n" +
          "これまで別々に届いていた「昨日の投稿結果」と「次にやること」を、毎朝7:40のこの1通にまとめました。投稿の承認カードは今までどおり別に届きます。",
      },
      {
        when: (c) => !(c.maxPerDay > 0 && c.requireApproval),
        text:
          "■ 1. 朝の案内は、この1通だけになりました\n" +
          "これまで別々に届いていた「昨日の投稿結果」と「次にやること」を、毎朝7:40のこの1通にまとめました。",
      },
      {
        when: (c) => c.maxPerDay > 0 && c.requireApproval,
        text:
          "■ 2. 承認したら、そのまま公開されます\n" +
          "承認カードで「OK」を押した投稿は、予定の時刻にそのまま公開されます。これまでどおりで、操作は変わりません。\n" +
          "また、こちらの都合で投稿が作れなかった日があれば、翌日に自動で1〜2件足してお届けします。",
      },
      {
        when: (c) => c.maxPerDay > 0 && !c.requireApproval,
        text:
          "■ 2. 投稿が作れなかった日は、翌日に足します\n" +
          "こちらの都合で投稿が作れなかった日があれば、翌日に自動で1〜2件足してお届けします。",
      },
      {
        when: (c) => c.maxPerDay >= 2 && c.metaAiEnabled,
        text:
          "■ 3. Meta AI呼びかけ文は、使っている方にだけ届きます\n" +
          "毎朝10時の呼びかけ文は、7日間ご投稿が無いと自動でお休みになり、その旨を一度だけお知らせします。使いたくなったら「設定」→「Meta AI呼びかけを再開する」でいつでも戻せます。",
      },
      {
        when: (c) => c.maxPerDay > 0 && c.requireApproval,
        text:
          "■ 4. 「自動（確認なし）にしませんか」の案内が届くことがあります\n" +
          "承認が習慣になっている方に、この朝の案内の中でご提案します。押さなければ何も変わりません。切り替えても「設定」からいつでも戻せます。",
      },
    ],
    tail: "分からないことがあれば、このLINEに文章で送ってください。",
  },
];

/** 今日（JST）送るべきお知らせ。無ければ null */
export function announcementForToday(now: number = Date.now()): DailyAnnouncement | null {
  const jst = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10);
  return DAILY_ANNOUNCEMENTS.find((a) => a.sendOn === jst) ?? null;
}
