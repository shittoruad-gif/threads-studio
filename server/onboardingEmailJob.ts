/**
 * 登録したまま止まっている方への、メールでのご案内。
 *
 * なぜメールなのか:
 *   「次にやること」の公式LINE通知は、LINE連携済みの方にしか届かない。
 *   ところが止まっている方の多くは、そもそもLINE連携をしていない。
 *   その方々に届く手段はメールしかない。
 *
 * 書き方の方針:
 *   ・「無料体験しませんか」とは書かない。登録した時点でフリープランが使える状態なので、
 *     すでに持っているものを勧めることになり、受け取った側が戸惑う。
 *     「もう使える状態です。あと1歩です」と伝える。
 *   ・やることは1つだけ書く。並べない。
 *   ・LINEでやるほうが早いので、そちらを主な導線にする。
 *
 * しつこくしない:
 *   ・2通で打ち止め（3日後・10日後）。それ以降は送らない。
 *   ・配信停止リンクを必ず入れる。
 *     （何度も送ると迷惑メール報告が増え、決済や承認の大事なメールまで
 *       届かなくなる。到達率はサービス全体の生命線なので、ここは守る）
 */
import * as db from "./db";
import { detectNextAction } from "./nextAction";
import { sendEmail } from "./_core/notification";
import { escapeHtml } from "@shared/sanitize";
import { createUnsubscribeToken } from "./unsubscribeToken";

/**
 * 1通目・2通目を送るまでの日数（登録日から）。
 * 1通目は翌日。登録した勢いがあるうちに次の一歩をお伝えしたいので、間を空けない。
 */
const FIRST_AFTER_DAYS = 1;
const SECOND_AFTER_DAYS = 10;

/**
 * ★これより前に登録された方には送らない。
 *
 * この仕組みを入れた時点で、何ヶ月も前に登録して放置されている方が
 * まとめて対象になってしまう（実測で23人・最古は登録から148日）。
 * そこへ一斉にメールを出すと、
 *   ・受け取る側は「今さら何の話か」となって効果が薄い
 *   ・迷惑メール報告が増えて、決済や承認の大事なメールまで届かなくなる
 * ので、動き出したばかりの方だけを対象にする。
 * 古くから止まっている方は、必要なら管理画面で状況を見て個別にご連絡いただく。
 */
const MAX_AGE_DAYS = 30;

type Step = { heading: string; body: string; cta: string; ctaPath: string };

/** いまの状態に合わせた「次の1歩」 */
function stepFor(key: string | null): Step {
  switch (key) {
    case "no_account":
      return {
        heading: "あと1歩で、毎日の投稿が始まります",
        body:
          "お店の情報のご登録、ありがとうございます。<br>" +
          "あとは Threads のアカウントをつなぐだけで、AIが毎日の投稿を作りはじめます。<br>" +
          "連携はパソコンからの操作がおすすめです（3分ほどで終わります）。",
        cta: "Threadsとつなぐ",
        ctaPath: "/threads-connect",
      };
    case "account_without_project":
    case "account_unpinned":
      return {
        heading: "連携したアカウントの設定が、あと1つ残っています",
        body:
          "つないでいただいた Threads アカウントに、そのアカウント用の「お店の情報」がまだ登録されていません。<br>" +
          "このままだと、別のアカウント向けに作った内容がそのまま投稿されてしまいます。<br>" +
          "質問にお答えいただくだけで登録できます（10〜15分）。",
        cta: "お店の情報を登録する",
        ctaPath: "/ai-counseling",
      };
    case "auto_off":
      return {
        heading: "自動投稿がOFFのままになっています",
        body:
          "設定はすべて整っていますが、毎日の自動投稿がOFFのため、投稿が作られていません。<br>" +
          "ONにすると、翌朝から投稿ができはじめます。",
        cta: "設定を開く",
        ctaPath: "/settings",
      };
    default:
      // お店の情報がまだ無い方（いちばん多い）
      return {
        heading: "まだ設定が途中です。あと1歩だけ残っています",
        body:
          "ご登録ありがとうございます。<br>" +
          "いまのご登録で、<strong>すでに無料でお使いいただける状態</strong>です。追加のお支払いは必要ありません。<br>" +
          "あとは「お店の情報」をご登録いただくと、その内容だけを使ってAIが投稿を作ります。<br>" +
          "質問にお答えいただくだけで終わります（10〜15分・全20問）。",
        cta: "お店の情報を登録する",
        ctaPath: "/ai-counseling",
      };
  }
}

function html(params: {
  name: string | null;
  step: Step;
  base: string;
  lineAddUrl: string | null;
  unsubUrl: string;
  second: boolean;
}): string {
  const greet = params.name ? `${escapeHtml(params.name)} 様` : "ご登録者さま";
  const lineBlock = params.lineAddUrl
    ? `<div style="margin:20px 0;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
         <p style="margin:0 0 6px;font-size:14px;font-weight:bold;color:#065f46;">公式LINEからのほうが簡単です</p>
         <p style="margin:0 0 10px;font-size:13px;color:#065f46;line-height:1.7;">
           友だち追加していただくと、設定から毎日の投稿の確認まで、LINEのトークの中だけで終わります。アプリの画面を開く必要はありません。
         </p>
         <a href="${params.lineAddUrl}" style="display:inline-block;background:#06c755;color:#fff;text-decoration:none;padding:9px 18px;border-radius:8px;font-size:14px;font-weight:bold;">公式LINEを友だち追加</a>
       </div>`
    : "";
  const closing = params.second
    ? `<p style="margin:18px 0 0;font-size:13px;color:#64748b;line-height:1.7;">
         ご案内は今回で最後にいたします。ご不明な点があれば、このメールにご返信ください。
       </p>`
    : "";

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;">
    <p style="margin:0 0 14px;font-size:14px;color:#334155;">${greet}</p>
    <h2 style="font-size:19px;color:#0f172a;margin:0 0 12px;line-height:1.5;">${params.step.heading}</h2>
    <p style="margin:0 0 16px;font-size:15px;color:#334155;line-height:1.8;">${params.step.body}</p>
    <p style="margin:0 0 4px;">
      <a href="${params.base}${params.step.ctaPath}" style="display:inline-block;background:#059669;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:bold;">${escapeHtml(params.step.cta)}</a>
    </p>
    ${lineBlock}
    ${closing}
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 12px;">
    <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.7;">
      Threads Studio（株式会社しっとる）<br>
      使い方のご案内メールが不要な場合は<a href="${params.unsubUrl}" style="color:#64748b;">こちら</a>から停止できます。<br>
      お手続き・お支払いに関する大切なお知らせは、停止後も引き続きお送りします。
    </p>
  </div>`;
}

export async function runOnboardingEmailJob(): Promise<void> {
  const targets = await db.listUsersForOnboardingEmail();
  if (targets.length === 0) {
    console.log("[OnboardingEmail] 対象なし");
    return;
  }
  const base = process.env.APP_BASE_URL || "https://threads-studio.com";
  const lineAddUrl = process.env.LINE_NOTIFY_ADD_URL || null;
  let sent = 0;
  let skipped = 0;

  for (const t of targets) {
    try {
      // 設定が済んでいる方には送らない
      const action = await detectNextAction(t.userId);
      if (!action) { skipped++; continue; }

      const ageDays = (Date.now() - t.createdAt.getTime()) / 86400000;
      if (ageDays > MAX_AGE_DAYS) { skipped++; continue; }
      const needDays = t.stage === 0 ? FIRST_AFTER_DAYS : SECOND_AFTER_DAYS;
      if (ageDays < needDays) { skipped++; continue; }

      // 1通目の直後に2通目が続かないようにする（1通目=翌日・2通目=10日目なので通常は空く）
      if (t.lastSentAt && (Date.now() - t.lastSentAt.getTime()) / 86400000 < 5) { skipped++; continue; }

      const second = t.stage >= 1;
      const step = stepFor(action.key);
      const unsubUrl = `${base}/api/unsubscribe?token=${createUnsubscribeToken(t.userId)}`;
      const ok = await sendEmail({
        to: t.email,
        subject: second
          ? "【Threads Studio】設定があと1歩のままです"
          : `【Threads Studio】${step.heading}`,
        html: html({ name: t.name, step, base, lineAddUrl, unsubUrl, second }),
      });
      if (ok !== false) {
        await db.recordOnboardingEmailSent(t.userId, t.stage + 1);
        sent++;
      }
    } catch (e) {
      console.error(`[OnboardingEmail] user=${t.userId} の送信に失敗:`, e);
    }
  }

  console.log(`[OnboardingEmail] 送信 ${sent}件 / 対象外 ${skipped}件 / 全 ${targets.length}人`);
}
