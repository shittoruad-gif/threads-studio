/**
 * 固定投稿ウィザード通知メール 一括送信スクリプト
 *
 * 使い方:
 *   # ドライラン（実際には送らず対象者だけ表示）
 *   npx tsx scripts/sendWizardNotification.ts --dry-run
 *
 *   # 本番送信
 *   npx tsx scripts/sendWizardNotification.ts
 *
 * 環境変数:
 *   DATABASE_URL  - MySQL接続文字列
 *   RESEND_API_KEY - Resend API キー
 *   RESEND_FROM_DOMAIN - 送信元ドメイン（省略時は resend.dev）
 *   APP_BASE_URL  - アプリのベースURL（省略時は https://threads-studio.com）
 */

import "dotenv/config";
import { getDb } from "../server/db";
import { users } from "../drizzle/schema";
import { isNotNull, eq } from "drizzle-orm";
import { sendEmail } from "../server/_core/notification";

const DRY_RUN = process.argv.includes("--dry-run");
const DELAY_MS = 300; // 送信間隔（Resend レート制限対策）

const BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.VITE_APP_URL ||
  "https://threads-studio.com";

/** ウィザード設定ページへの直リンク */
const WIZARD_URL = `${BASE_URL}/dashboard`;

function buildEmailHtml(): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;max-width:600px;margin:0 auto;padding:8px;background:#f8fafc;">
  <div style="background:#ffffff;border-radius:16px;padding:32px 28px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:#ecfdf5;border-radius:50%;width:56px;height:56px;line-height:56px;font-size:28px;">📌</div>
    </div>

    <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;text-align:center;">
      固定投稿の設定フローが新しくなりました
    </h2>

    <p style="margin:0 0 20px;font-size:15px;color:#334155;line-height:1.75;text-align:center;">
      店舗のURLを登録するだけで、より効果的な固定投稿が自動生成されます。<br />
      3分で完了する新しいフローをぜひお試しください。
    </p>

    <div style="background:#f1f5f9;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:#0f172a;">新しいウィザードの3ステップ</p>
      <ol style="margin:0;padding-left:20px;font-size:14px;color:#334155;line-height:2;">
        <li><strong>URL登録</strong>：公式LINE・Web予約・HPなどを登録</li>
        <li><strong>固定投稿作成</strong>：あなたの店舗に最適な投稿を自動生成</li>
        <li><strong>好み学習</strong>：フィードバックで文章のトーンを調整</li>
      </ol>
    </div>

    <div style="text-align:center;margin-bottom:28px;">
      <a href="${WIZARD_URL}"
         style="display:inline-block;background:#10b981;color:#ffffff;padding:16px 36px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:16px;letter-spacing:0.02em;">
        固定投稿の設定を確認する →
      </a>
      <p style="margin:10px 0 0;font-size:13px;color:#64748b;">所要時間：約3分</p>
    </div>

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 20px;" />

    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
      このメールは Threads Studio からお送りしています。<br />
      ご不明な点はダッシュボードのチャットサポートからお問い合わせください。
    </p>
  </div>
</div>
  `.trim();
}

async function main() {
  console.log(`\n=== 固定投稿ウィザード通知メール 一括送信スクリプト ===`);
  console.log(`モード: ${DRY_RUN ? "【DRY RUN - 実際には送信しません】" : "【本番送信】"}`);
  console.log(`送信先URL: ${WIZARD_URL}\n`);

  const db = await getDb();
  if (!db) {
    console.error("❌ DB接続に失敗しました。DATABASE_URL を確認してください。");
    process.exit(1);
  }

  // メールアドレスがある全ユーザーを取得
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      isDemoMode: users.isDemoMode,
    })
    .from(users)
    .where(isNotNull(users.email));

  // デモモードでないユーザー（本登録済み）に絞る
  const targets = allUsers.filter(
    (u) => u.email && !u.isDemoMode
  );

  console.log(`対象ユーザー数: ${targets.length} 人（全ユーザー ${allUsers.length} 人中）`);
  console.log(`  - デモモード除外: ${allUsers.length - targets.length} 人\n`);

  if (targets.length === 0) {
    console.log("送信対象がいません。終了します。");
    process.exit(0);
  }

  // 一覧表示（最初の10人）
  console.log("送信対象（先頭10件）:");
  targets.slice(0, 10).forEach((u) => {
    console.log(`  [${u.id}] ${u.email} (${u.name || "名前なし"})`);
  });
  if (targets.length > 10) {
    console.log(`  ... 他 ${targets.length - 10} 件`);
  }

  if (DRY_RUN) {
    console.log("\n✅ DRY RUN 完了。--dry-run フラグを外して実行すると実際に送信されます。");
    process.exit(0);
  }

  // 本番送信
  console.log("\n送信開始...");
  const html = buildEmailHtml();
  const subject = "【スレッズスタジオ】店舗情報・固定投稿の設定をご確認ください";

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of targets) {
    if (!user.email) {
      skipped++;
      continue;
    }

    try {
      const ok = await sendEmail({ to: user.email, subject, html });
      if (ok) {
        sent++;
        console.log(`  ✅ [${user.id}] ${user.email}`);
      } else {
        skipped++;
        console.log(`  ⏭️  [${user.id}] ${user.email} (スキップ: QA_SAFE_MODE等)`);
      }
    } catch (err) {
      failed++;
      console.error(`  ❌ [${user.id}] ${user.email}: ${err}`);
    }

    // レート制限対策
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log(`\n=== 送信完了 ===`);
  console.log(`  成功: ${sent} 件`);
  console.log(`  スキップ: ${skipped} 件`);
  console.log(`  失敗: ${failed} 件`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("予期せぬエラー:", err);
  process.exit(1);
});
