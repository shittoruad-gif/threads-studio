/**
 * イベント告知の逆算スケジュール（2026-08-31 三上さん指示）。
 *
 * イベント（キャンペーン・セミナー・周年祭など）の開催日を登録すると、
 * 開催日から逆算した告知投稿を自動生成して予約する。段階ごとに伝える内容を変える:
 *   14日前 = 開催決定（何がある・いつ）
 *    7日前 = 内容の詳細（こんな人に来てほしい）
 *    3日前 = 参加方法・迷っている人への後押し
 *    前日   = 明日開催のリマインド
 *    当日   = 本日開催・最終案内
 *
 * 時刻は実測で反応が高い時間帯に合わせる（通常15時・前日は帰宅時間帯18時・当日は朝9時）。
 * すべてJSTで計算する（DBにはUTCで保存）。
 */

export interface CountdownStage {
  /** 開催日の何日前か（0=当日） */
  daysBefore: number;
  /** 投稿時刻（JSTの時） */
  hourJst: number;
  /** 画面表示用のラベル */
  label: string;
  /** AIへの指示（この段階で何を伝えるか） */
  aim: string;
}

export const COUNTDOWN_STAGES: readonly CountdownStage[] = [
  {
    daysBefore: 14,
    hourJst: 15,
    label: "2週間前・開催決定",
    aim: "イベントの開催が決まったことを知らせる。何をするイベントか・いつ開催かを短く伝え、楽しみにしてもらう。",
  },
  {
    daysBefore: 7,
    hourJst: 15,
    label: "1週間前・内容の紹介",
    aim: "イベントの中身を少し具体的に紹介する。どんな人に向いているか・当日何ができるかを伝える。",
  },
  {
    daysBefore: 3,
    hourJst: 15,
    label: "3日前・参加の後押し",
    aim: "参加方法・場所などの実務情報を伝え、迷っている人の背中をそっと押す。煽らない。",
  },
  {
    daysBefore: 1,
    hourJst: 18,
    label: "前日・リマインド",
    aim: "いよいよ明日であることを伝える。持ち物や開始時間など、当日に必要なことがあれば添える。",
  },
  {
    daysBefore: 0,
    hourJst: 9,
    label: "当日・本日開催",
    aim: "本日開催であることを伝える。今からでも参加できることが分かるように書く。",
  },
] as const;

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD'（JSTの日付）を、その日のJST 0時のUTC Dateにする */
export function jstDateStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+09:00`);
}

export interface CountdownSlot {
  stage: CountdownStage;
  /** 投稿予定日時（UTCのDate。JSTの stage.hourJst 時に相当） */
  scheduledAt: Date;
}

/**
 * 開催日から逆算して、これから投稿できるスロットだけを返す。
 * 直近すぎるスロット（now+20分以内）は生成が間に合わないので外す。
 * 開催日が過ぎていれば空配列。
 */
export function planCountdownSlots(eventDateStr: string, now: Date): CountdownSlot[] {
  const eventStart = jstDateStart(eventDateStr);
  if (Number.isNaN(eventStart.getTime())) return [];
  const minTime = now.getTime() + 20 * 60 * 1000;
  const slots: CountdownSlot[] = [];
  for (const stage of COUNTDOWN_STAGES) {
    const scheduledAt = new Date(
      eventStart.getTime() - stage.daysBefore * DAY_MS + stage.hourJst * 60 * 60 * 1000,
    );
    if (scheduledAt.getTime() >= minTime) {
      slots.push({ stage, scheduledAt });
    }
  }
  return slots;
}

/** 開催日をJST表記（M/D）にする（投稿本文・画面表示用） */
export function formatEventDateJst(dateStr: string): string {
  const d = jstDateStart(dateStr);
  const jst = new Date(d.getTime() + JST_OFFSET_MS);
  return `${jst.getUTCMonth() + 1}月${jst.getUTCDate()}日`;
}
