/**
 * 承認待ち投稿のお知らせメール（本文プレビュー＋ワンタップ承認ボタン付き）。
 *
 * 承認モードがONのとき、承認されないと投稿は公開されない。
 * 「アプリを開いてログインして探す」が面倒で放置され、結果として
 * 投稿がゼロになる事故を防ぐため、メールの中で内容を読んで
 * その場で承認できるようにする。
 *
 * リンクは署名付きトークン（server/approvalToken.ts）。
 * 押した先で内容をもう一度表示し、確認ボタンで確定する二段構えにしてある
 * （メールソフトのリンク先読みで勝手に公開されないようにするため）。
 */
import { sendEmail } from "./_core/notification";
import { createApprovalToken } from "./approvalToken";

export interface ApprovalMailPost {
  id: number;
  postContent: string | null;
  scheduledAt: Date | string | null;
}

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jstLabel(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 1投稿ぶんのカード（本文プレビュー＋承認/見送りボタン） */
function postCard(post: ApprovalMailPost, userId: number, base: string): string {
  const approveUrl = `${base}/api/post-approval?token=${createApprovalToken(post.id, userId, "approve")}`;
  const when = jstLabel(post.scheduledAt);
  const body = esc((post.postContent || "").slice(0, 400)).replace(/\n/g, "<br />");
  const more = (post.postContent || "").length > 400 ? "…" : "";

  return `
  <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 16px;">
    ${when ? `<p style="margin:0 0 8px;font-size:13px;color:#64748b;">投稿予定：${when}</p>` : ""}
    <div style="background:#f1f5f9;border-radius:8px;padding:14px;font-size:15px;line-height:1.8;color:#0f172a;">${body}${more}</div>
    <a href="${approveUrl}" style="display:block;text-align:center;background:#10b981;color:#ffffff;padding:14px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:15px;margin-top:14px;">この内容で投稿する</a>
    <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;text-align:center;">押すと内容をもう一度確認できます（見送ることもできます）</p>
  </div>`;
}

/**
 * 承認待ちの投稿をまとめて1通で知らせる。
 * @param overdue 予定時刻を過ぎて放置されていた分かどうか（文面が変わる）
 */
export async function sendApprovalDigestEmail(params: {
  to: string;
  userId: number;
  posts: ApprovalMailPost[];
  overdue?: boolean;
}): Promise<void> {
  const { to, userId, posts, overdue = false } = params;
  if (posts.length === 0) return;

  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const cards = posts.map((p) => postCard(p, userId, base)).join("");

  const lead = overdue
    ? `<p style="margin:0 0 8px;font-size:15px;color:#334155;">自動作成された投稿 <strong>${posts.length}件</strong> が、承認されないまま予定時刻を過ぎていました。投稿時刻は翌日に自動で調整しています。</p>`
    : `<p style="margin:0 0 8px;font-size:15px;color:#334155;">本日ぶんの投稿 <strong>${posts.length}件</strong> を作成しました。内容を確認して、よければボタンを押してください。</p>`;

  await sendEmail({
    to,
    subject: overdue
      ? `【Threads Studio】承認待ちの投稿が ${posts.length} 件あります`
      : `【Threads Studio】本日の投稿 ${posts.length} 件をご確認ください`,
    html: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;">
      <h2 style="font-size:19px;color:#0f172a;margin:0 0 12px;">投稿の確認をお願いします</h2>
      ${lead}
      <p style="margin:0 0 20px;font-size:14px;color:#64748b;">承認するまで公開されません。このメールのボタンから、ログインなしで承認できます。</p>
      ${cards}
      <p style="margin:20px 0 0;font-size:13px;color:#64748b;">文章を直したいときは
        <a href="${base}/post-history?status=awaiting_approval" style="color:#0f766e;">アプリの投稿履歴</a>から編集できます。</p>
      <p style="margin:8px 0 0;font-size:12px;color:#94a3b8;">毎回の確認が不要な場合は、設定ページで承認モードをオフにすると自動で公開されます。</p>
    </div>`,
  });
}
