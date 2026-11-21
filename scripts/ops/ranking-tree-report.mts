/**
 * ランキング型の試し（shared/rankingTree.ts）の集計。読み取りのみ。
 * 学習用アカウントの期間中の自動投稿を3つに分け、1本目の表示（公開から48時間たった投稿だけ）を比べる。
 *   ランキング・ツリー（experimentKey=ranking3・id 奇数・順位の切れ目で分けられた本文）
 *   ランキング・1本（experimentKey=ranking3・id 偶数、または分けられなかった本文）
 *   ふつう（それ以外。写真・動画・アンケート・クイズ・1か所変えは除く）
 *   実行: ( eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)" && npx tsx scripts/ops/ranking-tree-report.mts )
 * 見方：アカウントごとの「中央値÷ふつうの中央値」。ランキングの各群が7本以上で、店舗の2アカウントが同じ向きなら傾向ありとみる。
 *   返信（コメント）が付いた割合も並べる（ツリーの2本目・3本目は自分の返信なので、1本目の返信数からは引けない＝参考）。
 */
const { RANKING_TREE, RANKING_TRIAL_KEY, rankingArm, rankingSplit } = await import("../../shared/rankingTree");
const db = await import("../../server/db");
const { decrypt } = await import("../../server/encryption");
const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const ids = RANKING_TREE.accountIds.join(",");
const accts: any[] = ((await d!.execute(sql.raw(`SELECT id, threadsUsername, accessToken FROM threadsAccounts WHERE id IN (${ids})`))) as any)[0];
const posts: any[] = ((await d!.execute(sql.raw(`
  SELECT id, threadsAccountId, postContent, publishedThreadsPostId, postedAt, experimentKey, angle FROM scheduledPosts
  WHERE threadsAccountId IN (${ids}) AND source = 'auto' AND status = 'posted' AND publishedThreadsPostId IS NOT NULL
    AND mediaItemId IS NULL AND pollOptions IS NULL AND quotePostId IS NULL
    AND (angle IS NULL OR angle NOT IN ('spoiler_quiz', 'one_spot'))
    AND postedAt >= '${RANKING_TREE.start} 00:00:00' - INTERVAL 9 HOUR AND postedAt <= '${RANKING_TREE.until} 23:59:59' - INTERVAL 9 HOUR
    AND postedAt < UTC_TIMESTAMP() - INTERVAL 48 HOUR`))) as any)[0];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const j = async (u: string) => (await fetch(u)).json() as any;
type Arm = "tree" | "single" | "normal";
const armOf = (p: any): Arm => p.experimentKey !== RANKING_TRIAL_KEY ? "normal"
  : rankingArm(Number(p.id)) === "tree" && rankingSplit(p.postContent) ? "tree" : "single";
console.log(`ランキング型の試し ${RANKING_TREE.start}〜${RANKING_TREE.until}（1本目の表示・公開48時間後）`);
for (const a of accts) {
  const tok = decrypt(a.accessToken);
  const target = posts.filter((p) => Number(p.threadsAccountId) === Number(a.id));
  const rows: { arm: Arm; views: number; replies: number }[] = [];
  for (let k = 0; k < target.length; k += 8) {
    await Promise.all(target.slice(k, k + 8).map(async (p) => {
      const r = await j(`https://graph.threads.net/v1.0/${p.publishedThreadsPostId}/insights?metric=views,replies&access_token=${tok}`);
      if (r.error) return;
      const m: any = {}; for (const x of r.data ?? []) m[x.name] = Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0);
      rows.push({ arm: armOf(p), views: m.views ?? 0, replies: m.replies ?? 0 });
    }));
  }
  const of = (arm: Arm) => rows.filter((r) => r.arm === arm);
  const base = med(of("normal").map((r) => r.views));
  const line = (label: string, arm: Arm) => {
    const x = of(arm); const m = med(x.map((r) => r.views));
    const rep = x.length ? `${Math.round((x.filter((r) => r.replies > 0).length / x.length) * 100)}%` : "-";
    return `${label} ${x.length}本 中央値${Number.isNaN(m) ? "-" : m} 返信あり${rep}${arm !== "normal" && base > 0 && x.length ? ` 倍率${(m / base).toFixed(2)}` : ""}`;
  };
  console.log(`@${a.threadsUsername}（${a.id}）${line("ランキング・ツリー", "tree")} ／ ${line("ランキング・1本", "single")} ／ ${line("ふつう", "normal")}`);
}
process.exit(0);
