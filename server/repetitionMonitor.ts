/**
 * 「同じ投稿に見せない」の週次の見張り（毎週月曜 9:10・shared/repetitionRules.ts の M1〜M3）。
 * 基準を超えたアカウントを運営にだけ知らせる（お客様には何も送らない）。
 * 手で見るとき：scripts/ops/repetition-report.mts（読むだけ・知らせない）
 */
import * as db from './db';
import { sql } from 'drizzle-orm';
import { REPETITION_RULES } from '../shared/repetitionRules';
import type { RepetitionMetrics } from '../shared/repetitionGuard';

export interface AccountRepetition { accountId: number; username: string; metrics: RepetitionMetrics }

export async function measureAllAccounts(): Promise<AccountRepetition[]> {
  const d = await db.getDb();
  if (!d) return [];
  const { measureRepetition } = await import('../shared/repetitionGuard');
  const { identityTokens } = await import('../shared/identityGuard');
  const { splitStyleSamples } = await import('../shared/styleTraits');
  const days = REPETITION_RULES.monitor.days;
  const accounts: any[] = ((await d.execute(sql`
    SELECT a.id, a.userId, a.threadsUsername, a.defaultProjectId FROM threadsAccounts a WHERE a.isActive = 1`)) as any)[0] ?? [];
  const out: AccountRepetition[] = [];
  for (const a of accounts) {
    try {
      if (!(await db.hasServiceAccess(Number(a.userId)))) continue;
      const rows: any[] = ((await d.execute(sql`
        SELECT postContent FROM scheduledPosts
        WHERE threadsAccountId = ${a.id} AND source = 'auto' AND choiceGroupId IS NULL
          AND status IN ('posted', 'pending', 'awaiting_approval') AND postContent IS NOT NULL
          AND scheduledAt >= UTC_TIMESTAMP() - INTERVAL ${days} DAY
        ORDER BY scheduledAt DESC`)) as any)[0] ?? [];
      if (rows.length < REPETITION_RULES.monitor.minPosts) continue;
      // お店の情報：アカウントの既定 → なければその方のいちばん新しいもの（朝の生成と同じ選び方）
      let project: any = a.defaultProjectId ? await db.getProjectById(String(a.defaultProjectId)) : null;
      if (!project) {
        const p2: any[] = ((await d.execute(sql`SELECT id FROM projects WHERE userId = ${a.userId} ORDER BY updatedAt DESC LIMIT 1`)) as any)[0] ?? [];
        if (p2[0]?.id) project = await db.getProjectById(String(p2[0].id));
      }
      const protect = project
        ? [project.storeName, project.area, project.localTerms, project.businessType, project.target, project.title, ...identityTokens(project)]
        : [];
      const edits = await db.getUserEditedPosts(Number(a.userId), 20).catch(() => []);
      const ownerTexts = [...edits.map((e) => String(e.postContent ?? '')), ...splitStyleSamples(project?.styleSamples || null)];
      out.push({ accountId: Number(a.id), username: String(a.threadsUsername ?? ''), metrics: measureRepetition(rows.map((r) => String(r.postContent)), protect, ownerTexts) });
    } catch (e) {
      console.warn(`[RepetitionMonitor] account ${a.id} を数えられませんでした: ${(e as Error)?.message}`);
    }
  }
  return out;
}

export function repetitionReportText(list: readonly AccountRepetition[]): string {
  const flagged = list.filter((x) => x.metrics.flagged);
  const head = `同じ投稿に見せないルールの週次の見張り（直近${REPETITION_RULES.monitor.days}日・自動の投稿）\n数えたアカウント ${list.length}件／基準を超えた ${flagged.length}件`;
  if (flagged.length === 0) return `${head}\n基準を超えたアカウントはありません。`;
  const lines = flagged.map((x) => {
    const m = x.metrics;
    const parts = [
      m.topicWords.length > 0 ? `話題の言葉 ${m.topicWords.map((w) => `「${w.word}」${Math.round(w.share * 100)}%`).join('')}` : '',
      m.sameOpenings.length > 0 ? `同じ書き出し ${m.sameOpenings.map((o) => `「${o.opening}」${o.count}本`).join('')}` : '',
      m.sameSentences.length > 0 ? `同じ文 ${m.sameSentences.map((s) => `「${s.sentence.slice(0, 20)}」${s.count}本`).join('')}` : '',
    ].filter(Boolean).join(' ／ ');
    return `・account ${x.accountId}（@${x.username}・${m.posts}本）${parts}`;
  });
  return `${head}\n${lines.join('\n')}\n\n基準：shared/repetitionRules.ts（M1 話題の言葉${Math.round(REPETITION_RULES.monitor.topicShare * 100)}%以上／M2 同じ書き出し${REPETITION_RULES.monitor.sameOpening}本以上／M3 同じ文${REPETITION_RULES.monitor.sameSentence}本以上）。毎回出てよい店名・地名と、ご本人が書いた書き出し・文は数えない。`;
}

export async function runRepetitionMonitorJob(): Promise<void> {
  const list = await measureAllAccounts();
  const text = repetitionReportText(list);
  console.log(`[RepetitionMonitor] ${text.split('\n')[1]}`);
  if (!list.some((x) => x.metrics.flagged)) return;
  try {
    const { notifyOwner } = await import('./_core/notification');
    await notifyOwner({ title: '同じ投稿に見せないルール：基準を超えたアカウントがあります', content: text });
  } catch (e) {
    console.warn(`[RepetitionMonitor] 運営への通知に失敗: ${(e as Error)?.message}`);
  }
}
