/**
 * 公式LINEの「投稿の中身についてのご希望」を、書き方の決まり（threadsAccounts.ownerRules）に入れる流れ。
 *   判定と文の整え方は shared/contentRequest.ts。ここは確認のボタン・登録・運営への通知・ご質問の記録。
 *
 * ★2026-11-03 三上様「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」。
 *   10/12・10/14 のご希望は自動の返事だけで終わり、だれも設定に入れず、いらないと言われた話題の投稿が公開された。
 *
 * 決めごと
 *  - 勝手に入れない。必ず「登録する／直して登録する／登録しない」を押していただく。
 *  - 追記のみ。今ある決まりは消さない・書き換えない（上限なら上限のご案内）。
 *  - どう終わったか（登録した／登録しないを選んだ／担当者の対応が要る）は、毎回運営へ知らせる。
 *  - ご質問の記録（supportQuestions）は、登録したら handledAt/handledBy で「自動で反映済み」と分かるようにする。
 *  - 避けたい話題は、決まり（意味で効く・生成で最優先）に入れ、言葉が短く取れたときはNGワード（言葉そのものを避ける・
 *    実績などの行を渡さない）にも入れる。NGワードだけだと書いた後に言い換えられて話題が残る（autoPostScheduler.ts の #57 の注記）。
 */
import * as db from "./db";
import { textWithQuick, MENU_ITEMS } from "./lineChat";
import { addOwnerRule, parseOwnerRules, parseOwnerRuleMessage, OWNER_RULES } from "../shared/ownerRules";
import {
  CONTENT_RULE_CATEGORY,
  CONTENT_RULE_HANDLED_BY,
  DECLINED_TEXT,
  FIX_PROMPT_TEXT,
  buildProposalText,
  detectContentRequest,
  parseProposalRules,
  registeredText,
  type ContentRequest,
  type ContentRuleProposal,
} from "../shared/contentRequest";
import { isPastedContent } from "../shared/requestKind";

const MENU_HINT = MENU_ITEMS;
const STATE_PENDING = "content_rule";
const STATE_FIX = "content_rule_fix";

type Acct = { id: number; userId: number; threadsUsername?: string | null; ownerRules?: string | null; defaultProjectId?: string | null; isActive?: boolean | null };

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

function accountButtons(accts: Acct[], s: string, qid: number | undefined): { label: string; data: string }[] {
  return accts.slice(0, 10).map((a) => ({
    label: `@${String(a.threadsUsername || a.id).slice(0, 14)}に登録`,
    data: `s=${s}&q=${qid ?? 0}&a=${a.id}`,
  }));
}

/**
 * 決まりの案をお客様にお出しする。アカウントが1つも無い方は null（今までどおりの受け答えへ）。
 *   questionId があれば（自動の答えが記録した行）その行を使い、無ければ記録を作る。
 */
export async function offerContentRules(p: {
  userId: number;
  lineUserId: string;
  question: string;
  request: ContentRequest;
  questionId?: number;
}): Promise<unknown[] | null> {
  const accts = await activeAccounts(p.userId);
  if (accts.length === 0) return null;
  const rules = p.request.rules.map((r) => r.rule);
  const text = buildProposalText(rules, { multiAccount: accts.length >= 2 });

  let qid = p.questionId;
  try {
    if (qid) {
      await db.updateSupportQuestion(qid, { aiAnswer: text, aiConfident: 1, needsHuman: 0, category: CONTENT_RULE_CATEGORY });
    } else {
      qid = await db.createSupportQuestion({
        userId: p.userId,
        lineUserId: p.lineUserId,
        source: "line",
        question: p.question.slice(0, 2000),
        aiAnswer: text,
        aiConfident: 1,
        needsHuman: 0,
        category: CONTENT_RULE_CATEGORY,
      });
    }
  } catch (e) {
    console.error("[ContentRule] ご希望の記録に失敗:", e);
  }
  try {
    await db.setLineChatState(p.lineUserId, STATE_PENDING, JSON.stringify({ q: qid ?? 0, rules: p.request.rules }));
  } catch { /* 状態が作れなくても、押したときに記録から読み戻す */ }

  const q = qid ?? 0;
  const buttons = accts.length >= 2
    ? [...accountButtons(accts, "crok", qid), { label: "直して登録する", data: `s=crfix&q=${q}` }, { label: "登録しない", data: `s=crno&q=${q}` }]
    : [{ label: "登録する", data: `s=crok&q=${q}` }, { label: "直して登録する", data: `s=crfix&q=${q}` }, { label: "登録しない", data: `s=crno&q=${q}` }];
  return [textWithQuick(text, buttons)];
}

/** 押されたボタンの決まりの案を取り出す（待ち状態→ご質問の記録の順。記録からは確認の文の「」の行を読み戻す） */
async function loadProposal(lineUserId: string, qid: number, row: any): Promise<ContentRuleProposal[]> {
  try {
    const st = await db.getLineChatState(lineUserId);
    if (st?.state === STATE_PENDING && st.payload) {
      const v = JSON.parse(st.payload);
      if (Number(v?.q) === qid && Array.isArray(v.rules) && v.rules.length) return v.rules as ContentRuleProposal[];
    }
  } catch { /* 読み戻しへ */ }
  const rules = parseProposalRules(row?.aiAnswer);
  if (!rules.length) return [];
  // NGワード（言葉）は文面に出していないので、元の文をもう一度読んで、同じ決まりのものだけ引き継ぐ
  const again = detectContentRequest(String(row?.question ?? ""))?.rules ?? [];
  return rules.map((r) => again.find((a) => a.rule === r) ?? { kind: "include" as const, rule: r });
}

/** 「登録する」「直して登録する」「登録しない」のボタン（s=crok / s=crfix / s=crno） */
export async function handleContentRulePostback(userId: number, lineUserId: string, q: Record<string, string>): Promise<unknown[]> {
  const qid = Number(q.q || 0);
  const row: any = qid ? await db.getSupportQuestionById(qid).catch(() => null) : null;
  if (row && row.userId != null && Number(row.userId) !== Number(userId)) {
    return [textWithQuick("このご希望が見つかりませんでした。もう一度お送りください。", MENU_HINT)];
  }
  if (row?.handledAt && String(row.handledBy || "").startsWith("自動")) {
    const done = row.handledBy === CONTENT_RULE_HANDLED_BY.registered ? "このご希望は、すでに書き方の決まりに登録しています。" : "このご希望は、登録しないで終えています。";
    return [textWithQuick(`${done}\n決まりは「設定」→「書き方の決まり」で見直せます。`, [{ label: "書き方の決まり", data: "s=rule" }, ...MENU_HINT])];
  }
  const proposals = await loadProposal(lineUserId, qid, row);
  const question = String(row?.question ?? "");
  const accts = await activeAccounts(userId);
  const user = await userOf(userId);

  if (q.s === "crno") {
    await db.clearLineChatState(lineUserId).catch(() => undefined);
    if (qid) await db.updateSupportQuestion(qid, { handledAt: new Date(), handledBy: CONTENT_RULE_HANDLED_BY.declined, needsHuman: 0 }).catch(() => undefined);
    const { notifyStaffOfContentRule } = await import("./supportNotify");
    await notifyStaffOfContentRule({
      outcome: "declined", questionId: qid || undefined, userName: user?.name, userEmail: user?.email,
      question, rules: proposals.map((r) => r.rule), pressed: "登録しない", reply: DECLINED_TEXT,
    }).catch(() => false);
    return [textWithQuick(DECLINED_TEXT, MENU_HINT)];
  }

  if (accts.length === 0) return [textWithQuick("先にThreadsアカウントの連携が必要です。", MENU_HINT)];
  const acct = q.a ? accts.find((a) => String(a.id) === String(q.a)) : accts.length === 1 ? accts[0] : undefined;
  if (!acct) {
    return [textWithQuick(
      "どのアカウントの決まりにしますか？",
      [...accountButtons(accts, q.s, qid), { label: "登録しない", data: `s=crno&q=${qid}` }],
    )];
  }

  if (q.s === "crfix") {
    await db.setLineChatState(lineUserId, STATE_FIX, JSON.stringify({ q: qid, a: acct.id }));
    const now = proposals.length ? `いまの案：\n${proposals.map((r) => `「${r.rule}」`).join("\n")}\n\n` : "";
    return [textWithQuick(now + FIX_PROMPT_TEXT, [{ label: "やめる", data: "m=cancel" }])];
  }

  // s=crok
  if (!proposals.length) {
    return [textWithQuick("決まりの文が見つかりませんでした。お手数ですが、もう一度ご希望をお送りください。", MENU_HINT)];
  }
  await db.clearLineChatState(lineUserId).catch(() => undefined);
  return registerRules({ userId, lineUserId, acct, accts, proposals, qid, question, user, edited: false });
}

/** 「直して登録する」のあとに送られた決まりの文 */
export async function handleContentRuleFixText(userId: number, lineUserId: string, payload: string | null, text: string): Promise<unknown[]> {
  const t = String(text ?? "").trim();
  if (/^(やめる|中止|キャンセル|戻る|もどる)$/.test(t)) {
    await db.clearLineChatState(lineUserId).catch(() => undefined);
    return [textWithQuick("決まりの登録をやめました。", MENU_HINT)];
  }
  const lines = t.split(/\r?\n/).map((l) => (parseOwnerRuleMessage(l.trim()) ?? l).replace(/^[\s　]*[-・•*]\s*/, "").replace(/^[「『](.+)[」』]$/, "$1").replace(/[。．]+$/, "").trim()).filter(Boolean);
  if (isPastedContent(t) || lines.length > 5 || lines.length === 0) {
    return [textWithQuick(
      "いまは「書き方の決まり」をお待ちしています。\n" +
      `投稿文ではなく、決まりを短い文でお送りください（1つ${OWNER_RULES.maxLen}字まで。いくつかある場合は改行で区切ってください）。\n` +
      "別のご用件でしたら、下の「やめる」を押してください。",
      [{ label: "やめる", data: "m=cancel" }],
    )];
  }
  const tooLong = lines.find((l) => Array.from(l).length > OWNER_RULES.maxLen);
  if (tooLong) {
    return [textWithQuick(
      `「${tooLong.slice(0, 20)}…」は${Array.from(tooLong).length}字あります。1つの決まりは${OWNER_RULES.maxLen}字までなので、短くしてもう一度お送りください。`,
      [{ label: "やめる", data: "m=cancel" }],
    )];
  }
  let v: { q?: number; a?: number } = {};
  try { v = JSON.parse(payload || "{}"); } catch { v = {}; }
  await db.clearLineChatState(lineUserId).catch(() => undefined);
  const accts = await activeAccounts(userId);
  const acct = accts.find((a) => Number(a.id) === Number(v.a)) ?? (accts.length === 1 ? accts[0] : undefined);
  if (!acct) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
  const qid = Number(v.q || 0);
  const row: any = qid ? await db.getSupportQuestionById(qid).catch(() => null) : null;
  const proposals: ContentRuleProposal[] = lines.map((r) => ({ kind: /(書かない|使わない|入れない|出さない|触れない|避ける)/.test(r) ? "avoid" : "include", rule: r }));
  return registerRules({ userId, lineUserId, acct, accts, proposals, qid, question: String(row?.question ?? t), user: await userOf(userId), edited: true });
}

/** NGワードに足す先のお店の情報（アカウントの既定のお店、無ければお店が1つだけのときのそのお店） */
async function projectForAccount(userId: number, acct: Acct): Promise<any | null> {
  try {
    const projects = (((await db.getProjectsByUserId(userId)) as any[]) || []).filter((pj: any) => !String(pj.id).startsWith("demo_"));
    if (acct.defaultProjectId) return projects.find((pj: any) => String(pj.id) === String(acct.defaultProjectId)) ?? null;
    return projects.length === 1 ? projects[0] : null;
  } catch {
    return null;
  }
}

async function addNgWordsForAccount(userId: number, acct: Acct, words: string[]): Promise<string[]> {
  if (!words.length) return [];
  const project = await projectForAccount(userId, acct);
  if (!project) return [];
  const cur = String(project.ngWords || "").split(/[、,，\n]/).map((w: string) => w.trim()).filter(Boolean);
  const fresh = words.filter((w) => !cur.includes(w));
  if (!fresh.length) return [];
  const merged = [...cur, ...fresh].join("、");
  try {
    await db.updateProject(project.id, { ngWords: merged } as any);
    try { await (await import("./counselingSync")).syncCounselingFromColumns(project.id, { ngWords: merged }); } catch { /* 答えの写しに失敗しても、NGワードは入っている */ }
    return fresh;
  } catch (e) {
    console.error("[ContentRule] NGワードの追加に失敗:", e);
    return [];
  }
}

/** 決まりをアカウントに足す（追記のみ）。結果をお客様に返し、運営へ知らせ、ご質問の記録を閉じる */
export async function registerRules(p: {
  userId: number;
  lineUserId: string;
  acct: Acct;
  accts: Acct[];
  proposals: ContentRuleProposal[];
  qid: number;
  question: string;
  user: any;
  edited: boolean;
}): Promise<unknown[]> {
  const fresh: any = await db.getThreadsAccountById(Number(p.acct.id));
  if (!fresh || Number(fresh.userId) !== Number(p.userId)) return [textWithQuick("そのアカウントが見つかりませんでした。", MENU_HINT)];
  let cur: string | null = fresh.ownerRules ?? null;
  const added: string[] = [];
  const already: string[] = [];
  const failed: string[] = [];
  let full = false;
  for (const pr of p.proposals) {
    const r = addOwnerRule(cur, pr.rule);
    if (r.added) { added.push(pr.rule); cur = r.rules.join("\n"); continue; }
    if (parseOwnerRules(cur).includes(pr.rule.trim())) { already.push(pr.rule); continue; }
    if (parseOwnerRules(cur).length >= OWNER_RULES.maxRules) full = true;
    failed.push(`「${pr.rule.slice(0, 30)}」：${r.reason}`);
  }
  if (added.length) await db.updateThreadsAccount(Number(p.acct.id), { ownerRules: cur } as any);

  const okRules = [...added, ...already];
  const ngCandidates = p.proposals.filter((pr) => pr.kind === "avoid" && pr.ngWord && okRules.includes(pr.rule)).map((pr) => pr.ngWord!);
  const ngAdded = okRules.length ? await addNgWordsForAccount(p.userId, { ...p.acct, defaultProjectId: fresh.defaultProjectId ?? p.acct.defaultProjectId }, ngCandidates) : [];
  const account = p.accts.length >= 2 ? String(p.acct.threadsUsername || "") || null : null;
  const { notifyStaffOfContentRule } = await import("./supportNotify");
  const base = { questionId: p.qid || undefined, userName: p.user?.name, userEmail: p.user?.email, account: String(p.acct.threadsUsername || "") || null, question: p.question };

  if (okRules.length) {
    if (p.qid) {
      await db.updateSupportQuestion(p.qid, { handledAt: new Date(), handledBy: CONTENT_RULE_HANDLED_BY.registered, needsHuman: failed.length ? 1 : 0, category: CONTENT_RULE_CATEGORY }).catch(() => undefined);
    }
    const head = added.length
      ? registeredText(added, { ngWords: ngAdded, account })
      : `「${already.join("」「")}」は、すでに書き方の決まりに入っています。\n決まりは「設定」→「書き方の決まり」で見直せます。`;
    const alsoAlready = added.length && already.length ? `\n（「${already.join("」「")}」は、すでに入っていました）` : "";
    const tail = failed.length ? `\n\n登録できなかったもの：\n${failed.join("\n")}` : "";
    const reply = head + alsoAlready + tail;
    const pressed = p.edited ? "直して登録する" : "登録する";
    await notifyStaffOfContentRule({ ...base, outcome: "registered", rules: okRules, ngWords: ngAdded, edited: p.edited, pressed, reply }).catch(() => false);
    if (failed.length) await notifyStaffOfContentRule({ ...base, outcome: full ? "limit" : "needs_human", rules: p.proposals.filter((pr) => !okRules.includes(pr.rule)).map((pr) => pr.rule), pressed, reply }).catch(() => false);
    return [textWithQuick(reply, [{ label: "書き方の決まり", data: `s=rule&a=${p.acct.id}` }, ...MENU_HINT])];
  }

  // 1つも足せなかった（上限・長すぎ）。担当者の対応が要るので記録に印を付けて知らせる
  if (p.qid) await db.updateSupportQuestion(p.qid, { needsHuman: 1, category: CONTENT_RULE_CATEGORY }).catch(() => undefined);
  const msg = full
    ? `書き方の決まりが上限の${OWNER_RULES.maxRules}件に達しているため、登録できませんでした。\n「設定」→「書き方の決まり」で使わなくなった決まりを消してから、もう一度お送りください。`
    : `登録できませんでした。\n${failed.join("\n")}`;
  const notified = await notifyStaffOfContentRule({
    ...base, outcome: full ? "limit" : "needs_human", rules: p.proposals.map((pr) => pr.rule),
    pressed: p.edited ? "直して登録する" : "登録する", reply: `${msg}\n担当者にもお伝えしました。`,
  }).catch(() => false);
  return [textWithQuick(
    msg + (notified ? "\n担当者にもお伝えしました。" : ""),
    [{ label: "書き方の決まり", data: `s=rule&a=${p.acct.id}` }, { label: "担当者に聞く", data: `m=staff${p.qid ? `&q=${p.qid}` : ""}` }, ...MENU_HINT],
  )];
}

/**
 * 投稿の中身のご希望らしいのに、決まりの文にできなかったとき。自動の返事で済ませずに担当者へ回す。
 *   needsHuman=1 にして運営へ知らせる。知らせられたら true。
 */
export async function escalateContentWish(userId: number, lineUserId: string, question: string, questionId?: number): Promise<boolean> {
  let qid = questionId;
  try {
    if (qid) await db.updateSupportQuestion(qid, { needsHuman: 1, category: CONTENT_RULE_CATEGORY });
    else qid = await db.createSupportQuestion({ userId, lineUserId, source: "line", question: question.slice(0, 2000), needsHuman: 1, aiConfident: 0, category: CONTENT_RULE_CATEGORY });
  } catch (e) {
    console.error("[ContentRule] 担当者へ回す記録に失敗:", e);
  }
  const user = await userOf(userId);
  const { notifyStaffOfContentRule } = await import("./supportNotify");
  return await notifyStaffOfContentRule({
    outcome: "needs_human", questionId: qid, userName: user?.name, userEmail: user?.email, question, rules: [],
    reply: escalatedText(null, true),
  }).catch(() => false);
}

/** 担当者へ回したときにお客様へお返しする文 */
export function escalatedText(aiAnswer: string | null, notified: boolean): string {
  if (!notified) {
    return (aiAnswer ? aiAnswer + "\n\n" : "") +
      "投稿の中身についてのご希望は、お手数ですが、下の「担当者に聞く」を押してからお送りください。";
  }
  return aiAnswer
    ? `${aiAnswer}\n\nこのご希望は担当者にもお伝えしました。設定に入れたら、このトークでお知らせします。`
    : "投稿の中身についてのご希望として、担当者にお伝えしました。設定に入れたら、このトークでお知らせします。";
}
