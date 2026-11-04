/**
 * 公式LINEの「設定で解決できるお問い合わせ」を、確認のボタン1つで反映する流れ（判定は shared/settingRequest.ts）。
 *
 * ★2026-11-04 三上様「今後、このような問い合わせが来たら、自動的に対応するように変更してください」。
 *   同じ日に手で対応した3件（投稿結果を送らないで／このHPを元に記事を／5日(木)12:00にお願いします）を、次からは自動で。
 *   作りは投稿の中身のご希望（server/contentRequestFlow.ts・2026-11-03）と同じ：
 *   判定 → お客様に確認のボタン → 押したら反映 → 三上様へ通知 → supportQuestions を自動で対応済みに。
 *
 * 決めごと
 *  - 勝手に変えない。必ずお客様に押していただいてから変える。
 *  - 2回押されても二重に変えない（ご質問の記録の handledAt で見る）。
 *  - ほかのお客様の記録・投稿・アカウントには触れない（押した方のものかを毎回確かめる）。
 *  - 自動で変えられなかったとき（ページが読めない・時刻の予約が見つからない など）は、三上様へ回す。
 *  - お客様に届く文：やさしい言葉・絵文字なし・宛名なし。
 */
import * as db from "./db";
import { textWithQuick, MENU_ITEMS } from "./lineChat";
import {
  NOTICE_CATALOG,
  NOTICE_KEYS,
  SETTING_CATEGORY,
  SETTING_ESCALATED_TEXT,
  SETTING_HANDLED_BY,
  UNSTOPPABLE_NOTE,
  decodeJst,
  detectNoticeRequest,
  detectPostTimeRequest,
  detectTopicUrlRequest,
  encodeJst,
  filterTopics,
  fixedHoursConfirmText,
  headingsFromHtml,
  hm,
  jstAt,
  jstDay,
  jstLabel,
  moveConfirmText,
  noticeCodes,
  noticeConfirmText,
  noticeKeysFromCodes,
  parseTopicsFromConfirm,
  topicsConfirmText,
  type NoticeKey,
  type NoticeRequest,
  type PostTimeRequest,
  type SettingKind,
} from "../shared/settingRequest";
import { validateFixedPostHours, parseFixedPostHours } from "../shared/fixedPostHours";
import { isHealthBusiness } from "../shared/healthClaimGuard";
import { POST_REQUEST_LEAD_MS } from "../shared/linePostRequest";
import type { SettingRequestKind, SettingRequestOutcome } from "./supportNotify";

const MENU_HINT = MENU_ITEMS;
const STATE_TOPICS = "setting_topics";
/** 同じアカウントのほかの投稿と、これより近い時刻には動かさない */
const MOVE_GAP_MS = 30 * 60_000;
/** 予約を探す範囲 */
const LOOKAHEAD_MS = 14 * 86400_000;

type Acct = { id: number; userId: number; threadsUsername?: string | null; isActive?: boolean | null; fixedPostHours?: string | null };

const KIND_OF: Record<SettingKind, SettingRequestKind> = { notice: "notice", topics: "topics", postTime: "post_time" };

async function activeAccounts(userId: number): Promise<Acct[]> {
  try {
    return (((await db.getThreadsAccountsByUserId(userId)) as any[]) || []).filter((a: any) => a && a.isActive !== false);
  } catch {
    return [];
  }
}

async function userOf(userId: number): Promise<any> {
  try { return await db.getUserById(userId); } catch { return null; }
}

async function maxPerDayOf(userId: number): Promise<number> {
  try {
    const sub: any = await db.getSubscriptionByUserId(userId);
    const { getPlan, resolveEffectivePlanId } = await import("../shared/plans");
    return Number(getPlan(resolveEffectivePlanId(sub?.planId, sub?.status))?.features?.maxAutoPostsPerDay ?? 0);
  } catch {
    return 0;
  }
}

/** ご質問の記録を作る（失敗しても流れは止めない） */
async function record(p: { userId: number; lineUserId: string; question: string; text: string; kind: SettingKind; needsHuman?: boolean }): Promise<number> {
  try {
    return (await db.createSupportQuestion({
      userId: p.userId,
      lineUserId: p.lineUserId,
      source: "line",
      question: p.question.slice(0, 2000),
      aiAnswer: p.text.slice(0, 4000),
      aiConfident: 1,
      needsHuman: p.needsHuman ? 1 : 0,
      category: SETTING_CATEGORY[p.kind],
    })) ?? 0;
  } catch (e) {
    console.error("[SettingRequest] ご質問の記録に失敗:", e);
    return 0;
  }
}

async function closeRow(qid: number, handledBy: string, kind: SettingKind, needsHuman = false): Promise<void> {
  if (!qid) return;
  await db.updateSupportQuestion(qid, { handledAt: new Date(), handledBy, needsHuman: needsHuman ? 1 : 0, category: SETTING_CATEGORY[kind] }).catch(() => undefined);
}

/** お客様にお送りする返事（LINEのメッセージ）から文だけを取り出す */
function replyText(r: unknown[] | string | null | undefined): string {
  if (!r) return "";
  if (typeof r === "string") return r;
  return r.map((m: any) => String(m?.text ?? "")).filter(Boolean).join("\n");
}

/**
 * 三上様の公式LINEへ「このようなお問い合わせが来たため、このように対応しました」を1通（メールは送らない・server/supportNotify.ts）。
 *   details の1つ目が「対応」、2つ目からは補足。pressed＝お客様が押したボタン、reply＝お客様に送った文。
 */
async function notify(p: { kind: SettingKind; outcome: SettingRequestOutcome; qid?: number; userId: number; question: string; details: string[]; account?: string | null; pressed?: string; reply?: unknown[] | string }): Promise<boolean> {
  const user = await userOf(p.userId);
  const { notifyStaffOfSettingRequest } = await import("./supportNotify");
  return await notifyStaffOfSettingRequest({
    kind: KIND_OF[p.kind], outcome: p.outcome, questionId: p.qid || undefined, userName: user?.name, userEmail: user?.email,
    account: p.account ?? null, question: p.question, details: p.details, pressed: p.pressed ?? null, reply: replyText(p.reply) || null,
  }).catch(() => false);
}

/**
 * 押されたボタンのご質問の記録。ほかの方の記録なら mismatch、自動で終えた記録なら done（二度押し）。
 */
async function rowFor(userId: number, qid: number): Promise<{ row: any; mismatch: boolean; done: boolean }> {
  const row: any = qid ? await db.getSupportQuestionById(qid).catch(() => null) : null;
  const mismatch = Boolean(row && row.userId != null && Number(row.userId) !== Number(userId));
  const done = Boolean(row?.handledAt && String(row.handledBy || "").startsWith("自動"));
  return { row, mismatch, done };
}

const NOT_FOUND = () => [textWithQuick("このご依頼が見つかりませんでした。お手数ですが、もう一度お送りください。", MENU_HINT)];

/** 担当者へ回したときのお返し（お伝えできなかったときは、担当者に聞くボタンへ） */
function escalatedReply(notified: boolean, qid: number, lead = ""): unknown[] {
  const text = notified
    ? `${lead}${SETTING_ESCALATED_TEXT}`
    : `${lead}お手数ですが、下の「担当者に聞く」を押してから、もう一度お送りください。`;
  return [textWithQuick(text, [{ label: "担当者に聞く", data: `m=staff${qid ? `&q=${qid}` : ""}` }, ...MENU_HINT])];
}

// ═════════════════════════ 入口 ═════════════════════════

/**
 * 公式LINEの自由文が、設定で解決できるお問い合わせなら、確認のボタンをお出しする。当たらなければ null（今までどおりの受け口へ）。
 *   順番：通知 → ホームページから話題 → 投稿の時刻（本文つきの投稿のご依頼は parsePostRequest が先に取る）。
 */
export async function trySettingRequest(p: { userId: number; lineUserId: string; text: string; now?: number }): Promise<unknown[] | null> {
  const now = p.now ?? Date.now();
  const notice = detectNoticeRequest(p.text);
  if (notice) return offerNotice(p.userId, p.lineUserId, p.text, notice);
  const topic = detectTopicUrlRequest(p.text);
  if (topic) {
    const r = await offerTopicsFromUrl({ userId: p.userId, lineUserId: p.lineUserId, question: p.text, url: topic.url });
    if (r) return r;
  }
  const time = detectPostTimeRequest(p.text, now);
  if (time) {
    const r = await offerPostTime({ userId: p.userId, lineUserId: p.lineUserId, question: p.text, req: time, now });
    if (r) return r;
  }
  return null;
}

/**
 * 自動の答え（supportBot）が「設定のご希望」と読んだのに、規則では読み取れなかったとき。答えだけで終わらせず担当者へ回す。
 */
export async function escalateSettingWish(p: { userId: number; lineUserId: string; question: string; kind: SettingKind; questionId?: number; reason: string }): Promise<unknown[]> {
  let qid = p.questionId ?? 0;
  try {
    if (qid) await db.updateSupportQuestion(qid, { needsHuman: 1, aiConfident: 0, category: SETTING_CATEGORY[p.kind] });
    else qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text: "", kind: p.kind, needsHuman: true });
  } catch (e) {
    console.error("[SettingRequest] 担当者へ回す記録に失敗:", e);
  }
  const notified = await notify({ kind: p.kind, outcome: "needs_human", qid, userId: p.userId, question: p.question, details: [`自動では反映していません。${p.reason}`], reply: escalatedReply(true, qid) });
  return escalatedReply(notified, qid);
}

// ═════════════════════════ 1. 通知 ═════════════════════════

type NoticeState = Record<NoticeKey, boolean>;

/** いま受け取っているか（true＝受け取る） */
async function noticeState(userId: number): Promise<NoticeState> {
  const u: any = (await userOf(userId)) ?? {};
  const nl = await db.getNewsletterOptOut(userId).catch(() => ({ optedOut: false, note: null }));
  const on = (v: unknown) => v !== 0 && v !== false && v !== "0";
  return {
    daily_result: on(u.dailyResultNotifyEnabled ?? 1),
    next_action: on(u.nextActionNotifyEnabled ?? 1),
    engagement: on(u.engagementCoachEnabled ?? 1),
    meta_ai: u.metaAiAskEnabled !== false && u.metaAiAskEnabled !== 0,
    newsletter: !nl.optedOut,
    email: !(u.emailOptOut === 1 || u.emailOptOut === true),
  };
}

/** 1つの通知を切り替える。できなかったときは理由を返す */
async function applyNotice(userId: number, key: NoticeKey, on: boolean): Promise<{ ok: true } | { ok: false; reason: string; human?: boolean }> {
  switch (key) {
    case "daily_result": await db.setUserNoticeFlag(userId, "dailyResultNotifyEnabled", on); return { ok: true };
    case "next_action": await db.setUserNoticeFlag(userId, "nextActionNotifyEnabled", on); return { ok: true };
    case "engagement": await db.setUserNoticeFlag(userId, "engagementCoachEnabled", on); return { ok: true };
    case "email": await db.setEmailOptOut(userId, !on); return { ok: true };
    case "meta_ai": {
      if (on && (await maxPerDayOf(userId)) < 2) return { ok: false, reason: "Meta AI呼びかけ投稿は、プロプラン・ビジネスプランで使えます。" };
      await db.updateAutoPostSettings(userId, { metaAiAskEnabled: on });
      if (on) {
        // 「使われていないため停止」も、戻したら解く（s=metaai&v=on と同じ）
        for (const a of (await activeAccounts(userId)) as any[]) {
          if (a.metaAiCallPausedAt || a.metaAiCallLightAt) await db.updateThreadsAccount(a.id, { metaAiCallPausedAt: null, metaAiCallLightAt: null, metaAiCallResumedAt: new Date() } as any).catch(() => {});
        }
      }
      return { ok: true };
    }
    case "newsletter": {
      const r = await db.setNewsletterOptOut(userId, !on);
      if (r.blocked) return { ok: false, reason: "週1回の読み物は、担当者の設定で止めています。担当者にお伝えしました。", human: true };
      return { ok: true };
    }
  }
}

function namesOf(keys: readonly NoticeKey[]): string {
  return keys.map((k) => NOTICE_CATALOG[k].label).join("と");
}

async function offerNotice(userId: number, lineUserId: string, question: string, req: NoticeRequest): Promise<unknown[]> {
  // どの通知か書かれていない（「通知はいらない」）：一覧から選んでいただく
  if (req.keys.length === 0 && !req.unstoppable) {
    const menu = await noticeMenu(userId, req.action === "off" ? "どのお知らせを止めますか。下のボタンで、1つずつ止めたり戻したりできます。" : "どのお知らせを受け取りますか。下のボタンで、1つずつ戻したり止めたりできます。");
    const qid = await record({ userId, lineUserId, question, text: String((menu[0] as any)?.text ?? ""), kind: "notice" });
    await closeRow(qid, SETTING_HANDLED_BY.noticeInfo, "notice");
    await notify({ kind: "notice", outcome: "info", qid, userId, question, details: ["どの通知か書かれていなかったため、「お知らせの受け取り」の一覧をお出ししました（お客様がボタンで切り替えるとその場で変わります）"], reply: menu });
    return menu;
  }
  // 止められない連絡だけ（承認カード・お支払い・お手続き）
  if (req.keys.length === 0) {
    const text = `${UNSTOPPABLE_NOTE}\n確認そのものが不要でしたら、「設定」の「確認なしにする」で、確認を待たずに予定の時刻に公開する形にできます。\nほかのお知らせは「設定」→「お知らせの受け取り」で止められます。`;
    const qid = await record({ userId, lineUserId, question, text, kind: "notice" });
    await closeRow(qid, SETTING_HANDLED_BY.noticeInfo, "notice");
    await notify({ kind: "notice", outcome: "info", qid, userId, question, details: ["承認カード・お支払い・お手続きの連絡は止められない旨をお返ししました"], reply: text });
    return [textWithQuick(text, [{ label: "お知らせの受け取り", data: "s=notif" }, { label: "設定", data: "m=settings" }, ...MENU_HINT])];
  }

  const st = await noticeState(userId);
  const want = req.action === "on";
  const already = req.keys.filter((k) => st[k] === want);
  const todo = req.keys.filter((k) => st[k] !== want);
  if (todo.length === 0) {
    const text = `${namesOf(already)}は、すでに${want ? "受け取る設定です" : "止めています"}。\n変えたいときは「設定」→「お知らせの受け取り」で切り替えられます。`;
    const qid = await record({ userId, lineUserId, question, text, kind: "notice" });
    await closeRow(qid, want ? SETTING_HANDLED_BY.noticeOn : SETTING_HANDLED_BY.noticeOff, "notice");
    await notify({ kind: "notice", outcome: "info", qid, userId, question, details: [`${namesOf(already)}は、すでにご希望どおりのため変えていません`], reply: text });
    return [textWithQuick(text, [{ label: "お知らせの受け取り", data: "s=notif" }, ...MENU_HINT])];
  }
  const text = noticeConfirmText({ action: req.action, keys: req.keys }, already) + (want && req.unstoppable ? `\n\n${UNSTOPPABLE_NOTE}` : "");
  const qid = await record({ userId, lineUserId, question, text, kind: "notice" });
  const v = want ? "on" : "off";
  return [textWithQuick(text, [
    { label: want ? "受け取る" : "止める", data: `s=ntok&q=${qid}&k=${noticeCodes(todo)}&v=${v}` },
    { label: want ? "今のままにする" : "止めない", data: `s=ntno&q=${qid}` },
  ])];
}

/** 「お知らせの受け取り」の一覧（設定から開く・どれか分からないとき）。ボタンはその場で切り替える */
export async function noticeMenu(userId: number, lead?: string): Promise<unknown[]> {
  const st = await noticeState(userId);
  const maxPerDay = await maxPerDayOf(userId);
  const keys = NOTICE_KEYS.filter((k) => (k === "meta_ai" ? maxPerDay >= 2 : k === "newsletter" ? maxPerDay > 0 || !st.newsletter : true));
  const lines = keys.map((k) => `・${NOTICE_CATALOG[k].label}：${st[k] ? "受け取る" : "止めている"}`);
  const buttons = keys.map((k) => ({
    label: `${st[k] ? "止める" : "戻す"}：${shortName(k)}`.slice(0, 20),
    data: `s=ntset&k=${NOTICE_CATALOG[k].code}&v=${st[k] ? "off" : "on"}`,
  }));
  return [textWithQuick(
    `${lead ? `${lead}\n\n` : ""}いまのお知らせの受け取りです。\n${lines.join("\n")}\n\n${UNSTOPPABLE_NOTE}`,
    [...buttons, { label: "設定に戻る", data: "m=settings" }],
  )];
}

function shortName(k: NoticeKey): string {
  return { daily_result: "昨日の投稿結果", next_action: "次にやること", engagement: "交流の案内", meta_ai: "Meta AI呼びかけ", newsletter: "読み物", email: "ご案内メール" }[k];
}

/** s=ntok / s=ntno / s=ntset / s=notif */
export async function handleNoticePostback(userId: number, lineUserId: string, q: Record<string, string>): Promise<unknown[]> {
  if (q.s === "notif") return noticeMenu(userId);
  const on = q.v === "on";
  const keys = noticeKeysFromCodes(q.k);

  if (q.s === "ntset") {
    // 一覧のボタン（押した＝そのご本人の操作）。記録は作らない
    if (keys.length === 0) return noticeMenu(userId);
    const res = await applyAll(userId, keys, on);
    const reply = [textWithQuick(resultText(res, on), [{ label: "お知らせの受け取り", data: "s=notif" }, ...MENU_HINT])];
    if (res.human.length) await notify({ kind: "notice", outcome: "needs_human", userId, question: "（「お知らせの受け取り」のボタン）", details: res.human, pressed: on ? "戻す" : "止める", reply });
    return reply;
  }

  const qid = Number(q.q || 0);
  const { row, mismatch, done } = await rowFor(userId, qid);
  if (mismatch) return NOT_FOUND();
  const question = String(row?.question ?? "");
  if (done) {
    const msg = row.handledBy === SETTING_HANDLED_BY.declined
      ? "このご依頼は、変えずに終えています。"
      : `このご依頼は、すでに${row.handledBy === SETTING_HANDLED_BY.noticeOn ? "受け取るようにしています" : "止めています"}。`;
    return [textWithQuick(`${msg}\n変えたいときは「設定」→「お知らせの受け取り」で切り替えられます。`, [{ label: "お知らせの受け取り", data: "s=notif" }, ...MENU_HINT])];
  }
  if (q.s === "ntno") {
    await closeRow(qid, SETTING_HANDLED_BY.declined, "notice");
    const reply = [textWithQuick("承知しました。今のままにします。", MENU_HINT)];
    await notify({ kind: "notice", outcome: "declined", qid, userId, question, details: ["通知の設定は変えていません"], pressed: row?.question && /また|再開|戻|受け取/.test(String(row.question)) ? "今のままにする" : "止めない", reply });
    return reply;
  }
  // s=ntok
  if (keys.length === 0) return NOT_FOUND();
  const res = await applyAll(userId, keys, on);
  const undo = res.done.length ? [{ label: "元に戻す", data: `s=ntset&k=${noticeCodes(res.done)}&v=${on ? "off" : "on"}` }] : [];
  const reply = [textWithQuick(resultText(res, on), [...undo, { label: "お知らせの受け取り", data: "s=notif" }, ...MENU_HINT])];
  const pressed = on ? "受け取る" : "止める";
  if (res.done.length) {
    await closeRow(qid, on ? SETTING_HANDLED_BY.noticeOn : SETTING_HANDLED_BY.noticeOff, "notice", res.human.length > 0);
    await notify({
      kind: "notice", outcome: "applied", qid, userId, question, pressed, reply,
      details: [`${namesOf(res.done)}を${on ? "また受け取るようにしました" : "止めました"}`, ...res.failed, ...res.human],
    });
  } else {
    if (qid) await db.updateSupportQuestion(qid, { needsHuman: res.human.length ? 1 : 0 }).catch(() => undefined);
    const [first, ...rest] = [...res.failed, ...res.human];
    await notify({ kind: "notice", outcome: res.human.length ? "needs_human" : "info", qid, userId, question, details: [`変えられませんでした：${first ?? ""}`, ...rest], pressed, reply });
  }
  return reply;
}

async function applyAll(userId: number, keys: readonly NoticeKey[], on: boolean): Promise<{ done: NoticeKey[]; failed: string[]; human: string[] }> {
  const done: NoticeKey[] = [];
  const failed: string[] = [];
  const human: string[] = [];
  for (const k of keys) {
    try {
      const r = await applyNotice(userId, k, on);
      if (r.ok) done.push(k);
      else (r.human ? human : failed).push(r.reason);
    } catch (e) {
      console.error(`[SettingRequest] 通知の切り替えに失敗 user=${userId} key=${k}:`, e);
      failed.push(`${NOTICE_CATALOG[k].label}は、いま切り替えられませんでした。時間をおいてもう一度お試しください。`);
    }
  }
  return { done, failed, human };
}

function resultText(res: { done: NoticeKey[]; failed: string[]; human: string[] }, on: boolean): string {
  const head = res.done.length
    ? on
      ? `${namesOf(res.done)}を、また受け取るようにしました。`
      : `${namesOf(res.done)}を止めました。\nまた受け取りたいときは「設定」→「お知らせの受け取り」で戻せます。`
    : "";
  return [head, ...res.failed, ...res.human].filter(Boolean).join("\n");
}

// ═════════════════════════ 2. ホームページから話題 ═════════════════════════

async function usableProjects(userId: number): Promise<any[]> {
  try {
    return ((await db.getUserProjects(userId)) || []).filter((pj: any) => !String(pj.id).startsWith("demo_") && pj.businessType);
  } catch {
    return [];
  }
}

/** 見出しが無いページは、本文から話題の名前だけを書き出してもらう（ページに書いてあることだけ） */
async function topicsByLlm(html: string): Promise<string[]> {
  try {
    const { htmlToText } = await import("./websitePrefill");
    const { title, text } = htmlToText(html);
    if (text.replace(/\s/g, "").length < 80) return [];
    const { invokeLLM } = await import("./_core/llm");
    const res: any = await invokeLLM({
      messages: [{
        role: "user",
        content:
          "以下は、あるお店のホームページの文章です。投稿で取り上げられる話題の名前を、ページに書いてあることだけから最大5つ挙げてください。\n" +
          "・1つ20字以内の名詞の形（例：「肩こりと姿勢」「産後の骨盤」）\n・料金・住所・予約・お問い合わせのことは入れない\n・書いてないことは足さない\n\n" +
          `【ページタイトル】${title.slice(0, 200)}\n【本文】\n${text.slice(0, 6000)}`,
      }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "page_topics", schema: { type: "object", properties: { topics: { type: "array", items: { type: "string" } } }, required: ["topics"], additionalProperties: false }, strict: true },
      } as any,
    });
    const raw = res?.choices?.[0]?.message?.content;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.topics) ? parsed.topics.map((t: unknown) => String(t ?? "")).slice(0, 10) : [];
  } catch (e) {
    console.warn("[SettingRequest] ページの話題の書き出しに失敗:", (e as Error)?.message);
    return [];
  }
}

export async function offerTopicsFromUrl(p: { userId: number; lineUserId: string; question: string; url: string }): Promise<unknown[] | null> {
  const projects = await usableProjects(p.userId);
  if (projects.length === 0) return null; // お店の情報がまだの方は、今までどおり（URLは「はじめの設定」の入口へ）
  const health = projects.some((pj: any) => isHealthBusiness(pj.businessType));
  const { fetchWebsite } = await import("./websitePrefill");
  const fetched = await fetchWebsite(p.url).catch(() => ({ ok: false as const, reason: "ページにつながりませんでした" }));
  if (!fetched.ok) {
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text: "", kind: "topics", needsHuman: true });
    const lead = `お送りいただいたページを読み取れませんでした（${fetched.reason}）。\n`;
    const notified = await notify({ kind: "topics", outcome: "needs_human", qid, userId: p.userId, question: p.question, details: [`ページを読めなかったため、ネタ帳には何も入れていません（${fetched.reason}）`, `URL：${p.url}`], reply: escalatedReply(true, qid, lead) });
    return escalatedReply(notified, qid, lead);
  }
  const { listActiveItems } = await import("./materialLedger");
  const existing: string[] = [];
  for (const pj of projects) {
    for (const it of await listActiveItems(String(pj.id)).catch(() => [] as any[])) existing.push(String(it.content));
  }
  let picked = filterTopics(headingsFromHtml(fetched.html), { health, existing });
  if (picked.topics.length === 0 && picked.dropped.length === 0 && picked.duplicate.length === 0) {
    picked = filterTopics(await topicsByLlm(fetched.html), { health, existing });
  }
  if (picked.topics.length === 0) {
    const why = picked.duplicate.length
      ? "ページの話題は、すでにネタ帳に入っていました"
      : picked.dropped.length
        ? `話題の候補（${picked.dropped.length}件）が、どれも健康の広告の決まりに触れやすいものでした`
        : "話題にできる見出しが見つかりませんでした";
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text: "", kind: "topics", needsHuman: !picked.duplicate.length });
    if (picked.duplicate.length) {
      await closeRow(qid, SETTING_HANDLED_BY.topics, "topics");
      const reply = [textWithQuick(`ページを読みました。${why}。\nこれからの投稿で順に使います。`, MENU_HINT)];
      await notify({ kind: "topics", outcome: "info", qid, userId: p.userId, question: p.question, details: [`${why}。ネタ帳には足していません`], reply });
      return reply;
    }
    const lead = `ページを読みましたが、${why}。\n`;
    const notified = await notify({ kind: "topics", outcome: "needs_human", qid, userId: p.userId, question: p.question, details: [`${why}。ネタ帳には何も入れていません`, ...picked.dropped.map((d) => `外した話題：${d}`)], reply: escalatedReply(true, qid, lead) });
    return escalatedReply(notified, qid, lead);
  }
  const text = topicsConfirmText({ topics: picked.topics, dropped: picked.dropped, duplicate: picked.duplicate, multiProject: projects.length >= 2 });
  const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "topics" });
  try {
    await db.setLineChatState(p.lineUserId, STATE_TOPICS, JSON.stringify({ q: qid, topics: picked.topics, dropped: picked.dropped }));
  } catch { /* 押したときに記録の確認の文から読み戻す */ }
  const buttons = projects.length >= 2
    ? projects.slice(0, 10).map((pj: any) => ({ label: `${String(pj.storeName || pj.title || "お店").slice(0, 12)}に登録`, data: `s=tpok&q=${qid}&p=${pj.id}` }))
    : [{ label: "この話題を登録する", data: `s=tpok&q=${qid}` }];
  return [textWithQuick(text, [...buttons, { label: "登録しない", data: `s=tpno&q=${qid}` }])];
}

/** s=tpok / s=tpno */
export async function handleTopicsPostback(userId: number, lineUserId: string, q: Record<string, string>): Promise<unknown[]> {
  const qid = Number(q.q || 0);
  const { row, mismatch, done } = await rowFor(userId, qid);
  if (mismatch || !row) return NOT_FOUND();
  const question = String(row.question ?? "");
  if (done) {
    return [textWithQuick(row.handledBy === SETTING_HANDLED_BY.declined ? "このご依頼は、登録しないで終えています。" : "このページの話題は、すでにネタ帳に登録しています。", MENU_HINT)];
  }
  if (q.s === "tpno") {
    await db.clearLineChatState(lineUserId).catch(() => undefined);
    await closeRow(qid, SETTING_HANDLED_BY.declined, "topics");
    const reply = [textWithQuick("承知しました。ネタ帳には登録しません。", MENU_HINT)];
    await notify({ kind: "topics", outcome: "declined", qid, userId, question, details: ["ネタ帳には登録していません", ...parseTopicsFromConfirm(row.aiAnswer).map((t) => `案：${t}`)], pressed: "登録しない", reply });
    return reply;
  }
  // 預かり → 記録の確認の文の順に読む
  let topics: string[] = [];
  try {
    const st = await db.getLineChatState(lineUserId);
    if (st?.state === STATE_TOPICS && st.payload) {
      const v = JSON.parse(String(st.payload));
      if (Number(v?.q) === qid && Array.isArray(v.topics)) topics = v.topics.map(String);
    }
  } catch { /* 読み戻しへ */ }
  if (!topics.length) topics = parseTopicsFromConfirm(row.aiAnswer);
  if (!topics.length) return NOT_FOUND();
  const projects = await usableProjects(userId);
  const pj = q.p ? projects.find((x: any) => String(x.id) === String(q.p)) : projects.length === 1 ? projects[0] : undefined;
  if (!pj) {
    if (projects.length >= 2) {
      return [textWithQuick("どのお店のネタ帳に入れますか？", [
        ...projects.slice(0, 10).map((x: any) => ({ label: `${String(x.storeName || x.title || "お店").slice(0, 12)}に登録`, data: `s=tpok&q=${qid}&p=${x.id}` })),
        { label: "登録しない", data: `s=tpno&q=${qid}` },
      ])];
    }
    return [textWithQuick("お店の情報が見つかりませんでした。先に「はじめの設定」をお願いします。", [{ label: "はじめの設定", data: "m=setup" }, ...MENU_HINT])];
  }
  const { listActiveItems, addItems } = await import("./materialLedger");
  const { normalizeMaterial, MATERIAL_MAX_LEN } = await import("../shared/materialLedger");
  const have = new Set((await listActiveItems(String(pj.id)).catch(() => [] as any[])).map((i: any) => normalizeMaterial(i.content)));
  const fresh = topics.filter((t) => !have.has(normalizeMaterial(t))).map((t) => t.slice(0, MATERIAL_MAX_LEN));
  let added = 0;
  try {
    added = fresh.length ? await addItems(userId, String(pj.id), fresh.map((content) => ({ kind: "topic" as const, content })), "line_url") : 0;
  } catch (e) {
    console.error("[SettingRequest] ネタ帳への登録に失敗:", e);
    if (qid) await db.updateSupportQuestion(qid, { needsHuman: 1 }).catch(() => undefined);
    const lead = "ネタ帳への登録がうまくいきませんでした。\n";
    const notified = await notify({ kind: "topics", outcome: "needs_human", qid, userId, question, details: ["ネタ帳への登録に失敗しました（何も入っていません）", ...topics.map((t) => `案：${t}`)], pressed: "この話題を登録する", reply: escalatedReply(true, qid, lead) });
    return escalatedReply(notified, qid, lead);
  }
  await db.clearLineChatState(lineUserId).catch(() => undefined);
  await closeRow(qid, SETTING_HANDLED_BY.topics, "topics");
  const store = String(pj.storeName || pj.title || "お店");
  const skipped = topics.length - fresh.length;
  const reply = [textWithQuick(
    (added
      ? `ネタ帳の「書いてほしい話題」に${added}件登録しました。\n（${store}）\nこれから作る投稿で、ひとつずつ主役にします。`
      : "どの話題も、すでにネタ帳に入っていました。") +
      (skipped && added ? `\n（${skipped}件は、すでに入っていました）` : "") +
      "\n※ 健康に関わる言い切りは、安全運用のために言い換わることがあります。",
    [{ label: "今日の投稿", data: "m=posts" }, ...MENU_HINT],
  )];
  await notify({
    kind: "topics", outcome: "applied", qid, userId, question, reply,
    pressed: projects.length >= 2 ? `${store}に登録` : "この話題を登録する",
    details: [
      `ページの見出しから話題を拾い、ネタ帳（${store}）の「書いてほしい話題」に${added}件登録しました：${fresh.map((t) => `「${t}」`).join("")}`,
      ...topics.filter((t) => !fresh.includes(t)).map((t) => `すでにあったため足さず：${t}`),
    ],
  });
  return reply;
}

// ═════════════════════════ 3. 投稿の時刻 ═════════════════════════

/** その投稿をその時刻に動かせるか。動かせなければ、お客様にお返しする理由 */
export async function moveProblem(userId: number, post: any, target: Date, accts: Acct[], now: number): Promise<string | null> {
  if (!post || Number(post.userId) !== Number(userId)) return "その投稿が見つかりませんでした。";
  if (post.status !== "pending" && post.status !== "awaiting_approval") return "この投稿は、もう時刻を動かせる状態ではありません（公開済み・取り消し済みなど）。";
  if (post.replyToThreadsId || post.angle === "pinned" || post.choiceGroupId) return "この投稿は、時刻を動かせない種類の投稿です。";
  const acct = accts.find((a) => Number(a.id) === Number(post.threadsAccountId));
  if (!acct) return "その投稿のアカウントが見つかりませんでした。";
  const label = jstLabel(target);
  if (!Number.isFinite(target.getTime()) || target.getTime() < now + POST_REQUEST_LEAD_MS) return `${label} は、もう過ぎているか間に合わないため、動かせませんでした。`;
  const cur = new Date(post.scheduledAt);
  if (Math.abs(cur.getTime() - target.getTime()) < 60_000) return `この投稿は、すでに ${label} に予約しています。`;
  const day = jstDay(target);
  if (day !== jstDay(cur)) {
    const { dayCapacity } = await import("./linePostRequest");
    const { cap, used } = await dayCapacity(acct, userId, day, now);
    if (cap !== null && used >= cap) {
      return `${day.slice(5).replace("-", "/")} はすでに${used}件の投稿が決まっていて、いまは1日${cap}件までのため、この日には動かせませんでした。`;
    }
  }
  const others = await db.getAccountSlotTimesOnDate(Number(acct.id), day, Number(post.id)).catch(() => [] as Date[]);
  if (others.some((o) => Math.abs(new Date(o).getTime() - target.getTime()) < MOVE_GAP_MS)) {
    return `${label} の近くに、同じアカウントの別の投稿が入っています。30分以上ずらした時刻でお送りください。`;
  }
  return null;
}

function headOf(post: any): string {
  const s = String(post?.postContent ?? "").replace(/\s+/g, " ").trim();
  return s.length > 30 ? `${s.slice(0, 30)}…` : s;
}

function acctName(accts: Acct[], id: unknown): string | null {
  if (accts.length < 2) return null;
  const a = accts.find((x) => Number(x.id) === Number(id));
  return a?.threadsUsername ? String(a.threadsUsername) : null;
}

/** ご依頼に合う予約（動かす元）と、動かす先の時刻 */
async function moveCandidates(userId: number, req: Extract<PostTimeRequest, { kind: "move" | "either" }>, accts: Acct[], now: number): Promise<Array<{ post: any; target: Date }>> {
  const posts = ((await db.listMovablePosts(userId, new Date(now), new Date(now + LOOKAHEAD_MS)).catch(() => [])) as any[])
    .filter((p) => accts.some((a) => Number(a.id) === Number(p.threadsAccountId)));
  const jst = (d: Date) => new Date(new Date(d).getTime() + 9 * 3600_000);
  let list: any[];
  if (req.kind === "either") {
    list = posts.slice(0, 1);
  } else if (req.from) {
    const from = req.from;
    list = posts.filter((p) => {
      const j = jst(p.scheduledAt);
      // 自動の投稿は0〜29分ずらしているので、「15時」は15:00〜15:59、「15:30」は前後29分を同じとみなす
      const okTime = from.minute === 0 ? j.getUTCHours() === from.hour : Math.abs(j.getUTCHours() * 60 + j.getUTCMinutes() - (from.hour * 60 + from.minute)) <= 29;
      return okTime && (!req.day || jstDay(p.scheduledAt) === req.day);
    });
    // 何日も当たるときは、いちばん近い日のものだけ
    if (list.length) { const d0 = jstDay(list[0].scheduledAt); list = list.filter((p) => jstDay(p.scheduledAt) === d0); }
  } else if (req.day) {
    list = posts.filter((p) => jstDay(p.scheduledAt) === req.day);
  } else {
    list = posts.slice(0, 1);
  }
  return list.slice(0, 5).map((post) => ({ post, target: jstAt(jstDay(post.scheduledAt), req.to.hour, req.to.minute) }));
}

export async function offerPostTime(p: { userId: number; lineUserId: string; question: string; req: PostTimeRequest; now: number }): Promise<unknown[] | null> {
  const accts = await activeAccounts(p.userId);
  if (accts.length === 0) return null;
  const { req } = p;

  if (req.kind === "fixed") return offerFixedHours(p.userId, p.lineUserId, p.question, req.hours, accts);

  const cands = await moveCandidates(p.userId, req, accts, p.now);
  const checked = await Promise.all(cands.map(async (c) => ({ ...c, problem: await moveProblem(p.userId, c.post, c.target, accts, p.now) })));
  const ok = checked.filter((c) => !c.problem);
  const toLabel = hm(req.to.hour, req.to.minute);

  if (req.kind === "either") {
    const lines = ["投稿の時刻のご希望ですね。どちらにしますか。", ""];
    const buttons: { label: string; data: string }[] = [];
    if (req.to.minute === 0) {
      lines.push(`・これからの自動投稿を、毎日${req.to.hour}:00にする`);
      buttons.push({ label: `毎日${req.to.hour}時にする`, data: "" });
    }
    if (ok[0]) {
      lines.push(`・次の予約（${jstLabel(ok[0].post.scheduledAt)}）だけ、${toLabel}に動かす`, "", `「${headOf(ok[0].post)}」`);
      buttons.push({ label: "次の1本だけ動かす", data: "" });
    }
    if (buttons.length === 0) return null;
    const text = lines.join("\n");
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "postTime" });
    const data = [
      ...(req.to.minute === 0 ? [`s=fhok&q=${qid}&h=${req.to.hour}${accts.length === 1 ? `&a=${accts[0].id}` : ""}`] : []),
      ...(ok[0] ? [`s=mvok&q=${qid}&i=${ok[0].post.id}&t=${encodeJst(ok[0].target)}`] : []),
    ];
    return [textWithQuick(text, [...buttons.map((b, i) => ({ label: b.label, data: data[i] })), { label: "今のままにする", data: `s=mvno&q=${qid}` }])];
  }

  // 動かせる予約が1件
  if (ok.length === 1) {
    const c = ok[0];
    const text = moveConfirmText({
      from: new Date(c.post.scheduledAt), to: c.target, account: acctName(accts, c.post.threadsAccountId),
      manual: c.post.source === "manual", awaiting: c.post.status === "awaiting_approval", head: headOf(c.post), bare: req.bare,
    });
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "postTime" });
    return [textWithQuick(text, [
      { label: `${toLabel}に動かす`, data: `s=mvok&q=${qid}&i=${c.post.id}&t=${encodeJst(c.target)}` },
      { label: "動かさない", data: `s=mvno&q=${qid}` },
      ...(req.bare ? [{ label: "ちがう", data: `s=stno&q=${qid}` }] : []),
    ])];
  }
  // 動かせる予約が何件か：1つずつ選んでいただく（押した1件だけを動かす）
  if (ok.length >= 2) {
    const mark = ["①", "②", "③", "④", "⑤"];
    const lines = ok.map((c, i) => {
      const who = acctName(accts, c.post.threadsAccountId);
      return `${mark[i]} ${who ? `@${who} ` : ""}${jstLabel(c.post.scheduledAt)}「${headOf(c.post)}」${c.post.source === "manual" ? "（ご自身で決めた投稿）" : ""}`;
    });
    const text = `予約している投稿が${ok.length}件あります。${toLabel}に動かす投稿を選んでください（押した投稿だけを動かします）。\n\n${lines.join("\n")}` +
      (req.bare ? "\n\n投稿の時刻のことではない場合（Zoomの日程のお返事など）は、「ちがう」を押してください。" : "");
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "postTime" });
    return [textWithQuick(text, [
      ...ok.map((c, i) => ({ label: `${mark[i]}を${toLabel}に`, data: `s=mvok&q=${qid}&i=${c.post.id}&t=${encodeJst(c.target)}` })),
      { label: "動かさない", data: `s=mvno&q=${qid}` },
      ...(req.bare ? [{ label: "ちがう", data: `s=stno&q=${qid}` }] : []),
    ])];
  }
  // 当たる予約はあるが、どれも動かせない（過ぎた時刻・上限・近くに別の投稿）
  if (checked.length) {
    const reasons = Array.from(new Set(checked.map((c) => c.problem as string)));
    const text = `${reasons.join("\n")}\n予約の時刻は「今日の投稿」で確かめられます。`;
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "postTime" });
    await closeRow(qid, SETTING_HANDLED_BY.moveRefused, "postTime");
    const reply = [textWithQuick(text, [{ label: "今日の投稿", data: "m=posts" }, { label: "担当者に聞く", data: `m=staff&q=${qid}` }, ...MENU_HINT])];
    await notify({ kind: "postTime", outcome: "info", qid, userId: p.userId, question: p.question, details: [`予約は動かしていません（動かせない理由をお返ししました）`, ...reasons], reply });
    return reply;
  }
  // 当たる予約が無い。日にちだけのご依頼で、ちょうど0分なら「これからの自動投稿の時刻」としても選べるようにする
  if (!req.from && req.day && req.to.minute === 0) {
    const text =
      `${req.day.slice(5).replace("-", "/")} に予約している投稿は、まだありません（その日の投稿は、前の日の夜か当日の朝に作ります）。\n` +
      `これからの自動投稿を毎日${req.to.hour}:00にする場合は、下のボタンを押してください。` +
      (req.bare ? "\n投稿の時刻のことではない場合（Zoomの日程のお返事など）は、「ちがう」を押してください。" : "");
    const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text, kind: "postTime" });
    return [textWithQuick(text, [
      { label: `毎日${req.to.hour}時にする`, data: `s=fhok&q=${qid}&h=${req.to.hour}${accts.length === 1 ? `&a=${accts[0].id}` : ""}` },
      { label: "今のままにする", data: `s=mvno&q=${qid}` },
      ...(req.bare ? [{ label: "ちがう", data: `s=stno&q=${qid}` }] : []),
    ])];
  }
  // 予約が見つからない：担当者へ
  const qid = await record({ userId: p.userId, lineUserId: p.lineUserId, question: p.question, text: "", kind: "postTime", needsHuman: true });
  const what = req.from ? `${hm(req.from.hour, req.from.minute)}ごろに予約している投稿` : "動かせる予約";
  const lead = `${what}が見つかりませんでした。\n`;
  const notified = await notify({ kind: "postTime", outcome: "needs_human", qid, userId: p.userId, question: p.question, details: [`${what}が見つからないため、何も動かしていません（この先14日・確認待ち／予約中を探しました）`], reply: escalatedReply(true, qid, lead) });
  return escalatedReply(notified, qid, lead);
}

async function offerFixedHours(userId: number, lineUserId: string, question: string, hours: number[], accts: Acct[]): Promise<unknown[]> {
  const v = validateFixedPostHours(hours.join(","));
  if (!v.ok || v.hours.length === 0) {
    return escalateSettingWish({ userId, lineUserId, question, kind: "postTime", reason: `自動投稿の時刻として読めませんでした（${v.ok ? "時刻なし" : v.error}）` });
  }
  const same = accts.filter((a) => (parseFixedPostHours(a.fixedPostHours) ?? []).join(",") === v.value);
  if (same.length === accts.length) {
    const text = `${accts.length >= 2 ? "どのアカウントも、" : ""}自動投稿の時刻は、すでに「${v.hours.map((h) => `${h}:00`).join("、")}」に決まっています。`;
    const qid = await record({ userId, lineUserId, question, text, kind: "postTime" });
    await closeRow(qid, SETTING_HANDLED_BY.fixedHours, "postTime");
    await notify({ kind: "postTime", outcome: "info", qid, userId, question, details: [`自動投稿の時刻は、すでに ${v.value} 時のため変えていません`], reply: text });
    return [textWithQuick(text, MENU_HINT)];
  }
  const multi = accts.length >= 2;
  const text = fixedHoursConfirmText(v.hours, { multiAccount: multi });
  const qid = await record({ userId, lineUserId, question, text, kind: "postTime" });
  const h = v.hours.join(".");
  const buttons = multi
    ? [
        ...accts.slice(0, 8).map((a) => ({ label: `@${String(a.threadsUsername || a.id).slice(0, 12)}に決める`, data: `s=fhok&q=${qid}&a=${a.id}&h=${h}` })),
        { label: "すべてのアカウント", data: `s=fhok&q=${qid}&a=all&h=${h}` },
      ]
    : [{ label: "この時刻にする", data: `s=fhok&q=${qid}&a=${accts[0].id}&h=${h}` }];
  return [textWithQuick(text, [...buttons, { label: "今のままにする", data: `s=fhno&q=${qid}` }])];
}

/** s=fhok / s=fhno / s=fhset / s=mvok / s=mvno / s=mvset / s=stno */
export async function handlePostTimePostback(userId: number, lineUserId: string, q: Record<string, string>, now: number = Date.now()): Promise<unknown[]> {
  const accts = await activeAccounts(userId);

  // 「元に戻す」（押した＝ご本人の操作。記録は作らない）
  if (q.s === "fhset") {
    const acct = accts.find((a) => String(a.id) === String(q.a));
    if (!acct) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    const value = q.h === "none" ? null : validateFixedPostHours(String(q.h || "").replace(/\./g, ","));
    if (value && !value.ok) return NOT_FOUND();
    await db.updateThreadsAccount(Number(acct.id), { fixedPostHours: value && value.ok && value.value ? value.value : null } as any);
    return [textWithQuick(value && value.ok && value.value ? `自動投稿の時刻を「${value.hours.map((x) => `${x}:00`).join("、")}」に戻しました。` : "自動投稿の時刻を、今まで通りの決め方に戻しました。", MENU_HINT)];
  }
  if (q.s === "mvset") {
    const post: any = await db.getScheduledPostById(Number(q.i)).catch(() => null);
    const target = decodeJst(q.t);
    if (!target) return NOT_FOUND();
    const problem = await moveProblem(userId, post, target, accts, now);
    if (problem) return [textWithQuick(problem, MENU_HINT)];
    await applyMove(post, target);
    return [textWithQuick(`${jstLabel(target)} に戻しました。文章はそのままです。`, MENU_HINT)];
  }

  const qid = Number(q.q || 0);
  const { row, mismatch, done } = await rowFor(userId, qid);
  if (mismatch || !row) return NOT_FOUND();
  const question = String(row.question ?? "");
  if (done) {
    const msg = row.handledBy === SETTING_HANDLED_BY.declined
      ? "このご依頼は、変えずに終えています。"
      : row.handledBy === SETTING_HANDLED_BY.movePost
        ? "このご依頼の投稿は、すでに時刻を動かしています。"
        : row.handledBy === SETTING_HANDLED_BY.fixedHours
          ? "このご依頼の時刻は、すでに決めています。"
          : "このご依頼は、すでに終えています。";
    return [textWithQuick(msg, MENU_HINT)];
  }
  if (q.s === "fhno" || q.s === "mvno") {
    await closeRow(qid, SETTING_HANDLED_BY.declined, "postTime");
    const reply = [textWithQuick("承知しました。今のままにします。", MENU_HINT)];
    await notify({ kind: "postTime", outcome: "declined", qid, userId, question, details: [q.s === "fhno" ? "自動投稿の時刻は変えていません" : "予約の時刻は動かしていません"], pressed: q.s === "fhno" ? "今のままにする" : "動かさない／今のままにする", reply });
    return reply;
  }
  if (q.s === "stno") {
    if (qid) await db.updateSupportQuestion(qid, { needsHuman: 1, category: "その他" }).catch(() => undefined);
    const okReply = [textWithQuick("承知しました。担当者にお伝えしました。このトークでお返事します。", MENU_HINT)];
    const notified = await notify({ kind: "postTime", outcome: "needs_human", qid, userId, question, details: ["投稿の時刻のご依頼ではないとのことで、何も変えていません（Zoomの日程のお返事などの可能性）"], pressed: "ちがう", reply: okReply });
    return notified ? okReply : escalatedReply(false, qid);
  }

  if (q.s === "fhok") {
    const v = validateFixedPostHours(String(q.h || "").replace(/\./g, ","));
    if (!v.ok || v.hours.length === 0) return NOT_FOUND();
    const targets = q.a === "all" ? accts : accts.filter((a) => String(a.id) === String(q.a));
    if (!q.a && accts.length >= 2) {
      return [textWithQuick("どのアカウントの時刻にしますか？", [
        ...accts.slice(0, 8).map((a) => ({ label: `@${String(a.threadsUsername || a.id).slice(0, 12)}に決める`, data: `s=fhok&q=${qid}&a=${a.id}&h=${q.h}` })),
        { label: "すべてのアカウント", data: `s=fhok&q=${qid}&a=all&h=${q.h}` },
        { label: "今のままにする", data: `s=fhno&q=${qid}` },
      ])];
    }
    const list = q.a ? targets : accts.slice(0, 1);
    if (list.length === 0) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    const details: string[] = [];
    const prevOf = new Map<number, string>();
    for (const a of list) {
      const fresh: any = await db.getThreadsAccountById(Number(a.id)).catch(() => null);
      if (!fresh || Number(fresh.userId) !== Number(userId)) continue;
      prevOf.set(Number(a.id), String(fresh.fixedPostHours || ""));
      details.push(`@${a.threadsUsername || a.id}：${fresh.fixedPostHours || "今まで通り"} → ${v.value}`);
      await db.updateThreadsAccount(Number(a.id), { fixedPostHours: v.value } as any);
    }
    if (details.length === 0) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
    await closeRow(qid, SETTING_HANDLED_BY.fixedHours, "postTime");
    const one = list.length === 1 ? list[0] : null;
    const prev = one ? prevOf.get(Number(one.id)) ?? "" : "";
    const reply = [textWithQuick(
      `${list.length >= 2 ? "すべてのアカウントの" : accts.length >= 2 && one ? `@${one.threadsUsername} の` : ""}これからの自動投稿の時刻を「${v.hours.map((h) => `${h}:00`).join("、")}」に決めました。明日以降に作る投稿から変わります。\nすでに予約済みの投稿の時刻は変わりません。`,
      [...(one ? [{ label: "元に戻す", data: `s=fhset&a=${one.id}&h=${prev ? prev.replace(/,/g, ".") : "none"}` }] : []), ...MENU_HINT],
    )];
    await notify({
      kind: "postTime", outcome: "applied", qid, userId, question, reply,
      pressed: q.a === "all" ? "すべてのアカウント" : accts.length >= 2 ? `@${one?.threadsUsername}に決める` : "この時刻にする",
      details: [`これからの自動投稿の時刻を「${v.hours.map((h) => `${h}:00`).join("、")}」に決めました`, ...details],
    });
    return reply;
  }

  if (q.s === "mvok") {
    const post: any = await db.getScheduledPostById(Number(q.i)).catch(() => null);
    const target = decodeJst(q.t);
    if (!target || !post) return NOT_FOUND();
    const problem = await moveProblem(userId, post, target, accts, now);
    if (problem) {
      const reply = [textWithQuick(problem, [{ label: "今日の投稿", data: "m=posts" }, ...MENU_HINT])];
      await notify({ kind: "postTime", outcome: "info", qid, userId, question, details: ["ボタンは押されましたが、動かせませんでした（予約はそのまま）", problem], pressed: "動かす", reply });
      return reply;
    }
    const from = new Date(post.scheduledAt);
    await applyMove(post, target);
    await closeRow(qid, SETTING_HANDLED_BY.movePost, "postTime");
    const reply = [textWithQuick(
      `${jstLabel(target)} に動かしました。文章はそのままです。` +
        (post.status === "awaiting_approval" ? "\n確認待ちの投稿なので、公開には今まで通り確認の設定がはたらきます。" : ""),
      [{ label: "元に戻す", data: `s=mvset&i=${post.id}&t=${encodeJst(from)}` }, { label: "今日の投稿", data: "m=posts" }, ...MENU_HINT],
    )];
    await notify({
      kind: "postTime", outcome: "applied", qid, userId, question, reply, pressed: `${hm(new Date(target.getTime() + 9 * 3600_000).getUTCHours(), new Date(target.getTime() + 9 * 3600_000).getUTCMinutes())}に動かす`,
      account: acctName(accts, post.threadsAccountId) ?? (accts[0]?.threadsUsername ? String(accts[0].threadsUsername) : null),
      details: [`予約の投稿 #${post.id}（${post.source === "manual" ? "ご自身で決めた投稿" : "自動の投稿"}・${post.status === "awaiting_approval" ? "確認待ち" : "予約中"}）を ${jstLabel(from)} → ${jstLabel(target)} に動かしました`],
    });
    return reply;
  }
  return NOT_FOUND();
}

async function applyMove(post: any, target: Date): Promise<void> {
  const dayChanged = jstDay(target) !== jstDay(post.scheduledAt);
  await db.updateScheduledPost(Number(post.id), { scheduledAt: target, ...(dayChanged ? { forDate: jstDay(target) } : {}) } as any);
  console.log(`[SettingRequest] 予約の時刻を動かしました post=${post.id} → ${target.toISOString()}`);
}
