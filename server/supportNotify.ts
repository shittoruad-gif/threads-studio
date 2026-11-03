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

  const to = staffEmail();
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

  // 運営のLINE（LINE_ADMIN_TARGET_ID）にも届ける。既存の通知と同じ経路。
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
 * 届け先はお問い合わせと同じ（メール＋運営LINE）。
 */
export type ContentRuleOutcome = "registered" | "declined" | "needs_human" | "limit";

const CONTENT_RULE_TITLE: Record<ContentRuleOutcome, string> = {
  registered: "投稿の決まりを自動で登録しました",
  declined: "投稿の決まりの登録をお客様が見送りました",
  needs_human: "投稿の中身のご希望（担当者の対応が要ります）",
  limit: "投稿の決まりが上限で登録できませんでした（担当者の対応が要ります）",
};

const CONTENT_RULE_FOOTER: Record<ContentRuleOutcome, string> = {
  registered: "設定に入れ終わっているので、対応は要りません（ご質問の記録は自動で対応済みにしました）。",
  declined: "お客様が「登録しない」を選びました。設定は変えていません。",
  needs_human: "決まりの文にできなかったため、設定は変えていません。内容を確かめて、書き方の決まり・NGワード・ネタ帳のどれに入れるかご判断ください。",
  limit: "書き方の決まりが上限（10件）までたまっていて足せませんでした。お客様には整理のお願いをお送りしています。",
};

/** 通知の本文（メール・LINE共通）。テストで中身を確かめられるように切り出す */
export function contentRuleNoticeBody(params: {
  outcome: ContentRuleOutcome;
  who: string;
  account?: string | null;
  question: string;
  rules: readonly string[];
  ngWords?: readonly string[];
  edited?: boolean;
}): string {
  const lines = [
    `${params.who}${params.account ? `（@${params.account}）` : ""}`,
    "",
    "お客様の文面：",
    params.question.slice(0, 600),
  ];
  if (params.rules.length) {
    lines.push("", params.outcome === "registered" ? `登録した決まり${params.edited ? "（お客様が直した文）" : ""}：` : "決まりの案：", ...params.rules.map((r) => `・${r}`));
  }
  if (params.ngWords?.length) lines.push(`NGワードにも追加：${params.ngWords.join("、")}`);
  lines.push("", CONTENT_RULE_FOOTER[params.outcome]);
  return lines.join("\n");
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
}): Promise<boolean> {
  if (process.env.QA_SAFE_MODE === "1") {
    console.log("[SupportNotify] QA_SAFE_MODE のため投稿の決まりの通知は送りません:", params.outcome, params.rules.join(" / ").slice(0, 60));
    return false;
  }
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const who = [params.userName, params.userEmail].filter(Boolean).join(" / ") || "（お名前不明）";
  const link = `${base}/admin/questions${params.questionId ? `?id=${params.questionId}` : ""}`;
  const title = CONTENT_RULE_TITLE[params.outcome];
  const body = contentRuleNoticeBody({ ...params, who });
  let delivered = false;

  const to = staffEmail();
  if (to) {
    try {
      const ok = await sendEmail({
        to,
        subject: `【Threads Studio】${title}（${who}）`,
        html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;">
          <h2 style="font-size:18px;color:#0f172a;margin:0 0 12px;">${escapeHtml(title)}</h2>
          <div style="margin:12px 0;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;color:#0f172a;white-space:pre-wrap;">${escapeHtml(body)}</div>
          <p style="margin:16px 0 0;font-size:14px;">
            <a href="${link}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:bold;">管理画面で見る</a>
          </p>
        </div>`,
      });
      delivered = delivered || ok !== false;
    } catch (e) {
      console.error("[SupportNotify] 投稿の決まりのメール通知に失敗:", e);
    }
  }
  try {
    const { notifyLine } = await import("./_core/notification");
    delivered = (await notifyLine(title, `${body.slice(0, 1400)}\n\n${link}`)) || delivered;
  } catch (e) {
    console.error("[SupportNotify] 投稿の決まりのLINE通知に失敗:", e);
  }
  if (!delivered) console.warn("[SupportNotify] 通知先が未設定のため、記録のみ行いました。questionId=", params.questionId);
  return delivered;
}
