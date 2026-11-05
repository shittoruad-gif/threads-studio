/**
 * お客様から担当者へのお問い合わせを、運営側に届ける。
 *
 * 届け先は既存の運営通知と同じ:
 *   - メール（ADMIN_NOTIFICATION_EMAIL。SUPPORT_NOTIFY_EMAIL があればそちらを優先）
 *   - LINE（LINE_ADMIN_TARGET_ID のトーク）
 * どちらも設定が無ければ、記録だけ残して静かに終わる（お客様への応答は止めない）。
 */
import { sendEmail } from "./_core/notification";
import { escapeHtml } from "@shared/sanitize";

function staffEmail(): string | null {
  // 既存の運営通知先をそのまま使う（新しい設定を増やさない）。
  return process.env.SUPPORT_NOTIFY_EMAIL || process.env.ADMIN_NOTIFICATION_EMAIL || null;
}

/** 担当者にお問い合わせを届ける。1つでも届けば true。 */
export async function notifyStaffOfQuestion(params: {
  questionId?: number;
  userName?: string | null;
  userEmail?: string | null;
  lineUserId?: string | null;
  message: string;
}): Promise<boolean> {
  // ★動作確認のときに、運営あてのメール・LINEを実際に飛ばさない。
  //   （業種ズレの通知と同じ扱い。夜間整備でこの経路を通すため追加）
  if (process.env.QA_SAFE_MODE === "1") {
    console.log("[SupportNotify] QA_SAFE_MODE のため担当者への通知は送りません:", params.message.slice(0, 40));
    return false;
  }
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const who = [params.userName, params.userEmail].filter(Boolean).join(" / ") || "（お名前不明）";
  const link = `${base}/admin/questions${params.questionId ? `?id=${params.questionId}` : ""}`;
  let delivered = false;

  // ★届け先は運営のLINE（LINE_ADMIN_TARGET_ID）だけ（2026-11-05 三上様「普通のお問い合わせもメールは止めてLINEだけに」）。
  try {
    const { notifyLine } = await import("./_core/notification");
    const ok = await notifyLine(
      "お客様からのお問い合わせ",
      `${who}\n\n${params.message.slice(0, 800)}\n\n返信はこちら\n${link}`,
    );
    delivered = delivered || ok;
  } catch (e) {
    console.error("[SupportNotify] LINE通知に失敗:", e);
  }

  // LINEに届かなかったときだけ、取りこぼさないようメールで送る。
  const to = delivered ? null : staffEmail();
  if (to) {
    try {
      const ok = await sendEmail({
        to,
        subject: `【Threads Studio】お客様からのお問い合わせ（${who}）`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;">
          <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px;">お客様からのお問い合わせ</h2>
          <p style="margin:0 0 6px;font-size:14px;color:#334155;"><strong>お客様：</strong>${escapeHtml(who)}</p>
          <div style="margin:12px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:15px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(params.message)}</div>
          <p style="margin:16px 0 0;font-size:14px;">
            <a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">管理画面で返信する</a>
          </p>
          <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">管理画面から返信すると、お客様のLINEに直接お送りします。</p>
        </div>`,
      });
      delivered = delivered || ok !== false;
    } catch (e) {
      console.error("[SupportNotify] メール通知に失敗:", e);
    }
  }

  if (!delivered) {
    console.warn("[SupportNotify] 通知先が未設定のため、記録のみ行いました。questionId=", params.questionId);
  }
  return delivered;
}

/**
 * 業種と「はじめの設定」の答えがずれているお客様を、運営に知らせる。
 * 例：呉服店なのに整体の選択肢（冷え・むくみ／自律神経・睡眠ケア）が入っている。
 * 放っておくと、そのお店に別業種の投稿が出続ける（2026-09-06 三上様指示で追加）。
 * 届け先はお問い合わせと同じ（メール＋運営LINE）。お客様には何も送らない。
 */
export async function notifyStaffOfIndustryMismatch(params: {
  userId: number;
  userName?: string | null;
  userEmail?: string | null;
  storeName?: string | null;
  projectId: string;
  summary: string;
  hits: Array<{ fieldLabel: string; term: string; groupLabel: string }>;
}): Promise<boolean> {
  if (process.env.QA_SAFE_MODE === "1") {
    console.log("[SupportNotify] QA_SAFE_MODE のため業種ズレの通知は送りません:", params.summary);
    return false;
  }
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const who = [params.userName, params.userEmail].filter(Boolean).join(" / ") || "（お名前不明）";
  const store = params.storeName ? `「${params.storeName}」` : "";
  const detail = params.hits.slice(0, 8).map((h) => `・${h.fieldLabel}：「${h.term}」（${h.groupLabel}の言葉）`).join("\n");
  const body =
    `${who} ${store}\n\n${params.summary}\n\n${detail}\n\n` +
    `このままだと別の業種の投稿が作られます。お店の情報の見直しをおすすめします。\n` +
    `（お店の情報ID: ${params.projectId}）`;
  let delivered = false;

  const to = staffEmail();
  if (to) {
    try {
      const ok = await sendEmail({
        to,
        subject: `【Threads Studio】業種と登録内容のズレ（${who}）`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;">
          <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px;">業種と登録内容のズレ</h2>
          <div style="margin:12px 0;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(body)}</div>
          <p style="margin:16px 0 0;font-size:14px;">
            <a href="${base}/admin" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">管理画面を開く</a>
          </p>
        </div>`,
      });
      delivered = delivered || ok !== false;
    } catch (e) {
      console.error("[SupportNotify] 業種ズレのメール通知に失敗:", e);
    }
  }
  try {
    const { notifyLine } = await import("./_core/notification");
    delivered = (await notifyLine("業種と登録内容のズレ", body.slice(0, 1500))) || delivered;
  } catch (e) {
    console.error("[SupportNotify] 業種ズレのLINE通知に失敗:", e);
  }
  return delivered;
}

/**
 * 公式LINEの「投稿の中身についてのご希望」を、どう扱ったかを運営に知らせる（2026-11-03 三上様
 * 「そのような問い合わせに対して、自動的にきちんと反映できるようなシステムを組み込んで」・server/contentRequestFlow.ts）。
 *   registered  … お客様が「登録する」を押し、書き方の決まりに入れた（対応は要らない）
 *   declined    … お客様が「登録しない」を選んだ（設定は変えていない）
 *   needs_human … ご希望らしいが決まりの文にできなかった／上限で足せなかった（担当者の対応が要る）
 * 届け先は三上様の公式LINEだけ（2026-11-04〜。メールは送らない・下の pushToAdminLine）。
 */
export type ContentRuleOutcome = "registered" | "declined" | "needs_human" | "limit";

// ───────────────────────── 自動で対応したお問い合わせの知らせ（三上様の公式LINEだけ） ─────────────────────────
//
// ★2026-11-04 三上様：自動で対応したお問い合わせの知らせは、三上様の「Threads Studio 公式LINE」
//   （role=admin の方の公式LINE。server/clientFollowup.ts の adminLineIds と同じ届け先）にだけ送り、メールは送らない。
//   「このようなお問い合わせが来たため、このように対応しました」が一目で分かる1通にする。
//   お客様が見送ったとき・判定できず担当者が要るときも、同じLINEへ題を変えて送る。
//   対象：投稿の中身のご希望（server/contentRequestFlow.ts）と、設定で解決できるお問い合わせ（server/settingRequestFlow.ts）。
//   自動で対応できなかったふつうのお問い合わせ（notifyStaffOfQuestion）は今まで通り（メール＋LINE_ADMIN_TARGET_ID）。

export type StaffLineOutcome = "applied" | "declined" | "info" | "needs_human";

const STAFF_LINE_TITLE: Record<StaffLineOutcome, string> = {
  applied: "【自動で対応しました】",
  declined: "【お客様が見送りました】",
  info: "【ご案内だけお返ししました】",
  needs_human: "【担当者の対応が要ります】",
};

/** 三上様の公式LINEへ送る1通の本文（テストで中身を確かめられるように切り出す） */
export function staffLineNoticeText(p: {
  outcome: StaffLineOutcome;
  /** お客様のお名前（無ければメール） */
  name?: string | null;
  account?: string | null;
  question: string;
  /** 何をしたか（しなかったか） */
  action: string;
  /** お客様が押したボタン（「止める」など） */
  pressed?: string | null;
  /** 補足（変えた前後・外した話題など） */
  notes?: readonly string[];
  /** お客様に実際に送った文 */
  reply?: string | null;
  link: string;
}): string {
  const who = `${String(p.name || "").trim() || "お名前不明の方"} 様${p.account ? `（@${p.account}）` : ""}`;
  const action = p.pressed ? `${p.action}（お客様が「${p.pressed}」を押して確定）` : p.action;
  const lines = [
    `${STAFF_LINE_TITLE[p.outcome]}${who}`,
    `・お問い合わせ：${p.question.replace(/\s+/g, " ").trim().slice(0, 300)}`,
    `・対応：${action}`,
    ...(p.notes ?? []).filter(Boolean).map((n) => `・補足：${n}`),
    ...(p.reply ? [`・お客様への返事：${p.reply.trim().slice(0, 1200)}`] : []),
  ];
  const tail: Record<StaffLineOutcome, string> = {
    applied: `（対応は不要です。戻すときは管理画面 ${p.link}）`,
    declined: `（設定は変えていません。対応は不要です。管理画面 ${p.link}）`,
    info: `（設定は変えていません。対応は不要です。管理画面 ${p.link}）`,
    needs_human: `（設定は変えていません。内容を確かめてご対応ください。管理画面 ${p.link}）`,
  };
  lines.push("", tail[p.outcome]);
  return lines.join("\n").slice(0, 4900);
}

/** 三上様（role=admin）の公式LINE。server/clientFollowup.ts の adminLineIds と同じ選び方 */
export async function adminLineUserIds(): Promise<string[]> {
  const db = await import("./db");
  const database = await db.getDb();
  if (!database) return [];
  const { sql } = await import("drizzle-orm");
  const rows: any = await database.execute(sql`SELECT id FROM users WHERE role = 'admin'`);
  const ids: string[] = [];
  for (const r of ((rows as any)[0] ?? []) as any[]) ids.push(...(await db.getLineUserIdsForUser(Number(r.id)).catch(() => [] as string[])));
  return Array.from(new Set(ids));
}

/** 三上様の公式LINEへ1通（メールは送らない）。1人にでも届けば true */
export async function pushToAdminLine(text: string): Promise<boolean> {
  if (process.env.QA_SAFE_MODE === "1") {
    console.log("[SupportNotify] QA_SAFE_MODE のため三上様のLINEへの知らせは送りません:", text.split("\n")[0]);
    return false;
  }
  let ids: string[] = [];
  try { ids = await adminLineUserIds(); } catch (e) { console.error("[SupportNotify] 三上様のLINEの読み取りに失敗:", e); }
  if (ids.length === 0) {
    console.warn("[SupportNotify] 三上様の公式LINEが見つからないため、記録のみ行いました:", text.split("\n")[0]);
    return false;
  }
  const { pushMessages } = await import("./lineNotify");
  let delivered = false;
  for (const id of ids) {
    try { delivered = (await pushMessages(id, [{ type: "text", text }])) || delivered; } catch (e) { console.error("[SupportNotify] 三上様のLINEへの送信に失敗:", e); }
  }
  return delivered;
}

function adminLink(questionId?: number): string {
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  return `${base}/admin/questions${questionId ? `?id=${questionId}` : ""}`;
}

/** 投稿の中身のご希望の知らせ（どうなったか） */
export function contentRuleStaffAction(p: { outcome: ContentRuleOutcome; rules: readonly string[]; ngWords?: readonly string[]; edited?: boolean }): { outcome: StaffLineOutcome; action: string } {
  const rules = p.rules.map((r) => `「${r}」`).join("");
  if (p.outcome === "registered") {
    return {
      outcome: "applied",
      action: `書き方の決まりに${rules}を登録しました${p.edited ? "（お客様が直した文）" : ""}${p.ngWords?.length ? `。NGワードにも「${p.ngWords.join("」「")}」を足しました` : ""}`,
    };
  }
  if (p.outcome === "declined") return { outcome: "declined", action: `決まりの案${rules || "（なし）"}は登録していません` };
  if (p.outcome === "limit") return { outcome: "needs_human", action: `書き方の決まりが上限（10件）のため${rules}を登録できませんでした。お客様には整理のお願いをお送りしています` };
  return { outcome: "needs_human", action: `投稿の中身のご希望ですが、決まりの文にできませんでした${rules ? `（案：${rules}）` : ""}。書き方の決まり・NGワード・ネタ帳のどれに入れるかご判断ください` };
}

export async function notifyStaffOfContentRule(params: {
  outcome: ContentRuleOutcome;
  questionId?: number;
  userName?: string | null;
  userEmail?: string | null;
  account?: string | null;
  question: string;
  rules: readonly string[];
  ngWords?: readonly string[];
  edited?: boolean;
  /** お客様が押したボタン */
  pressed?: string | null;
  /** お客様に送った文 */
  reply?: string | null;
}): Promise<boolean> {
  const a = contentRuleStaffAction(params);
  return pushToAdminLine(staffLineNoticeText({
    outcome: a.outcome, name: params.userName || params.userEmail, account: params.account, question: params.question,
    action: a.action, pressed: params.pressed, reply: params.reply, link: adminLink(params.questionId),
  }));
}

/**
 * 公式LINEの「設定で解決できるお問い合わせ」（通知の停止・ホームページから話題・投稿の時刻）を、
 * どう扱ったかを三上様の公式LINEへ知らせる（server/settingRequestFlow.ts）。
 *   applied     … お客様がボタンを押し、設定を変えた（対応は要らない）
 *   declined    … お客様が「止めない／登録しない」を選んだ（設定は変えていない）
 *   info        … ご案内だけをした（すでにご希望どおり・止められない連絡など。設定は変えていない）
 *   needs_human … 自動では読み取れなかった／ページを読めなかった／変えられなかった（担当者の対応が要る）
 */
export type SettingRequestKind = "notice" | "topics" | "post_time";
export type SettingRequestOutcome = StaffLineOutcome;

export async function notifyStaffOfSettingRequest(params: {
  kind: SettingRequestKind;
  outcome: SettingRequestOutcome;
  questionId?: number;
  userName?: string | null;
  userEmail?: string | null;
  account?: string | null;
  question: string;
  /** 1つ目が「対応」、2つ目からは補足 */
  details: readonly string[];
  pressed?: string | null;
  reply?: string | null;
}): Promise<boolean> {
  const [action, ...notes] = params.details.length ? params.details : ["（内容なし）"];
  return pushToAdminLine(staffLineNoticeText({
    outcome: params.outcome, name: params.userName || params.userEmail, account: params.account, question: params.question,
    action, notes, pressed: params.pressed, reply: params.reply, link: adminLink(params.questionId),
  }));
}
