import cron from 'node-cron';
import * as db from './db';
import { sendEmail } from './_core/notification';

interface WeeklyReportSummary {
  totalPosts: number;
  aiGeneratedPosts: number;
  scheduledPosts: number;
  completedPosts: number;
  bestPost: string | null;
}

/**
 * Generate weekly report data for a user
 */
export async function generateWeeklyReport(userId: number): Promise<WeeklyReportSummary> {
  const posts = await db.getUserPostsLastWeek(userId);
  const scheduled = await db.getScheduledPostsLastWeek(userId);

  const completedPosts = scheduled.filter(p => p.status === 'posted').length;

  // Find the "best performing" post (longest content as proxy)
  let bestPost: string | null = null;
  let maxLength = 0;

  for (const post of posts) {
    try {
      const content = JSON.parse(post.content);
      const mainPostLength = (content.mainPost || '').length;
      if (mainPostLength > maxLength) {
        maxLength = mainPostLength;
        bestPost = content.title || content.mainPost?.substring(0, 50) || null;
      }
    } catch {
      // skip invalid content
    }
  }

  return {
    totalPosts: posts.length,
    aiGeneratedPosts: posts.length,
    scheduledPosts: scheduled.length,
    completedPosts,
    bestPost,
  };
}

/**
 * Send weekly report email to a user
 */
export async function sendWeeklyReportEmail(userId: number): Promise<boolean> {
  // Get user info
  const user = await db.getUserById(userId);
  if (!user || !user.email) return false;

  // Check if user has pro+ plan
  const subscription = await db.getSubscriptionByUserId(userId);
  const planId = subscription?.planId || 'free';

  if (planId === 'free' || planId === 'light') {
    return false; // Only pro+ users get weekly reports
  }

  const report = await generateWeeklyReport(userId);

  const dashboardUrl = process.env.VITE_APP_URL || 'https://threads-studio-production-c190.up.railway.app';

  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">先週の投稿レポート</h1>
        <p style="color: rgba(255,255,255,0.85); margin-top: 8px; font-size: 14px;">Threads Studio Weekly Report</p>
      </div>

      <div style="padding: 32px;">
        <p style="color: #374151; margin-bottom: 24px;">
          ${user.name || 'ユーザー'}さん、お疲れさまです！先週の活動をまとめました。
        </p>

        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
          <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #059669;">${report.totalPosts}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">投稿数</div>
          </div>
          <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #2563eb;">${report.aiGeneratedPosts}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">自動生成数</div>
          </div>
          <div style="flex: 1; background: #fef3c7; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 28px; font-weight: bold; color: #d97706;">${report.scheduledPosts}</div>
            <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">予約投稿数</div>
          </div>
        </div>

        ${report.bestPost ? `
        <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 24px; border-left: 4px solid #10b981;">
          <p style="font-size: 12px; color: #6b7280; margin: 0 0 4px;">今週のベスト投稿</p>
          <p style="font-size: 14px; color: #374151; margin: 0; font-weight: 500;">${report.bestPost}</p>
        </div>
        ` : ''}

        <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
          <h3 style="color: #059669; margin: 0 0 12px; font-size: 16px;">今週のおすすめアクション</h3>
          <ul style="color: #374151; padding-left: 20px; margin: 0; font-size: 14px; line-height: 1.8;">
            ${report.totalPosts === 0 ? `
              <li>まずは1つ投稿を生成してみましょう</li>
              <li>プロジェクト情報を充実させると、より良い投稿が生成されます</li>
            ` : report.totalPosts < 3 ? `
              <li>投稿頻度を増やすとフォロワー獲得につながります</li>
              <li>異なる投稿タイプを試してみましょう</li>
            ` : `
              <li>この調子で継続しましょう！</li>
              <li>過去の投稿を分析して、反応が良いタイプを見つけましょう</li>
            `}
            <li>予約投稿を活用して、最適な時間に投稿しましょう</li>
          </ul>
        </div>

        <div style="text-align: center;">
          <a href="${dashboardUrl}/dashboard" style="display: inline-block; background: #10b981; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            ダッシュボードを開く
          </a>
        </div>
      </div>

      <div style="background: #f9fafb; padding: 16px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">
          Threads Studio | このメールは週次レポートとして自動送信されています
        </p>
      </div>
    </div>
  `;

  return await sendEmail({
    to: user.email,
    subject: '【Threads Studio】先週の投稿レポート',
    html,
  });
}

/**
 * Start the weekly report scheduler
 * Runs every Monday at 9:00 AM JST (0:00 UTC)
 */
export function startWeeklyReportScheduler() {
  // Monday at 9:00 AM JST = Monday 0:00 UTC
  cron.schedule('0 0 * * 1', async () => {
    console.log('[WeeklyReport] Starting weekly report generation...');

    try {
      const users = await db.getProPlusUsers();
      console.log(`[WeeklyReport] Sending reports to ${users.length} pro+ users`);

      for (const user of users) {
        try {
          await sendWeeklyReportEmail(user.id);
          console.log(`[WeeklyReport] Sent report to user ${user.id} (${user.email})`);
        } catch (error) {
          console.error(`[WeeklyReport] Failed to send report to user ${user.id}:`, error);
        }
      }

      console.log('[WeeklyReport] Weekly report generation complete');
    } catch (error) {
      console.error('[WeeklyReport] Error in weekly report scheduler:', error);
    }
  });

  console.log('[WeeklyReport] Scheduler started - runs every Monday at 9:00 AM JST');
}
