/**
 * ツリーの利点を生かした投稿の試し（shared/treeDesign.ts）の集計。読み取りのみ。
 * 学習用アカウントの期間中の自動投稿を分け、1本目の表示（公開から48時間たった投稿だけ）を比べる。
 *   設計ツリー（experimentKey=tree_*・id 奇数・型どおりに分けられた本文）
 *   設計・1本（experimentKey=tree_*・id 偶数、または分けられなかった本文）
 *   ふつう（それ以外。写真・動画・アンケート・クイズ・1か所変えは除く）
 *   実行: ( eval "$(bash scripts/ops/prod-env.sh DATABASE_URL TOKEN_ENCRYPTION_KEY)" && npx tsx scripts/ops/tree-design-report.mts )
 *         ※TOKEN_ENCRYPTION_KEY を読み込まないと、全部0本と出る
 * 見方：アカウントごとの「中央値÷ふつうの中央値」。設計ツリー・設計1本がそれぞれ10本以上で、店舗の2アカウントが同じ向きなら傾向ありとみる。
 *   型ごと（BEST3／Q&A／言い切り）・案内あり／なしは本数が少ないので参考。
 *   返信の数には、ツリーの2本目・3本目（自分の返信）が入る。コメントの比べには使わない。
 */
const { TREE_DESIGN, TREE_DESIGN_KEYS, TREE_DESIGN_TRIALS, isTreeDesignKey, treeDesignArm, treeDesignOffer, treeDesignSplit } = await import("../../shared/treeDesign");
const db = await import("../../server/db");
const { decrypt } = await import("../../server/encryption");
const d = await db.getDb(); const { sql } = await import("drizzle-orm");
const ids = TREE_DESIGN.accountIds.join(",");
const accts: any[] = ((await d!.execute(sql.raw(`SELECT id, threadsUsername, accessToken FROM threadsAccounts WHERE id IN (${ids})`))) as any)[0];
const posts: any[] = ((await d!.execute(sql.raw(`
  SELECT id, threadsAccountId, postContent, publishedThreadsPostId, experimentKey FROM scheduledPosts
  WHERE threadsAccountId IN (${ids}) AND source = 'auto' AND status = 'posted' AND publishedThreadsPostId IS NOT NULL
    AND mediaItemId IS NULL AND pollOptions IS NULL AND quotePostId IS NULL
    AND (angle IS NULL OR angle NOT IN ('spoiler_quiz', 'one_spot'))
    AND postedAt >= '${TREE_DESIGN.start} 00:00:00' - INTERVAL 9 HOUR AND postedAt <= '${TREE_DESIGN.until} 23:59:59' - INTERVAL 9 HOUR
    AND postedAt < UTC_TIMESTAMP() - INTERVAL 48 HOUR`))) as any)[0];
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const j = async (u: string) => (await fetch(u)).json() as any;
type Row = { arm: "tree" | "single" | "normal"; key: string | null; offer: boolean; views: number };
const armOf = (p: any): Row["arm"] => !isTreeDesignKey(p.experimentKey) ? "normal"
  : treeDesignArm(Number(p.id)) === "tree" && treeDesignSplit(p.experimentKey, p.postContent) ? "tree" : "single";
console.log(`ツリーの利点を生かした投稿の試し ${TREE_DESIGN.start}〜${TREE_DESIGN.until}（1本目の表示・公開48時間後）`);
for (const a of accts) {
  const tok = decrypt(a.accessToken);
  const target = posts.filter((p) => Number(p.threadsAccountId) === Number(a.id));
  const rows: Row[] = [];
  for (let k = 0; k < target.length; k += 8) {
    await Promise.all(target.slice(k, k + 8).map(async (p) => {
      const r = await j(`https://graph.threads.net/v1.0/${p.publishedThreadsPostId}/insights?metric=views&access_token=${tok}`);
      if (r.error) return;
      const v = Number(r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? 0);
      rows.push({ arm: armOf(p), key: isTreeDesignKey(p.experimentKey) ? p.experimentKey : null, offer: isTreeDesignKey(p.experimentKey) && treeDesignOffer(Number(p.id)), views: v });
    }));
  }
  const base = med(rows.filter((r) => r.arm === "normal").map((r) => r.views));
  const show = (label: string, x: Row[]) => {
    const m = med(x.map((r) => r.views));
    return `${label} ${x.length}本 中央値${Number.isNaN(m) ? "-" : m}${base > 0 && x.length ? ` 倍率${(m / base).toFixed(2)}` : ""}`;
  };
  console.log(`\n@${a.threadsUsername}（${a.id}） ふつう ${rows.filter((r) => r.arm === "normal").length}本 中央値${Number.isNaN(base) ? "-" : base}`);
  console.log(`  ${show("設計ツリー", rows.filter((r) => r.arm === "tree"))} ／ ${show("設計・1本", rows.filter((r) => r.arm === "single"))}`);
  for (const key of TREE_DESIGN_KEYS) {
    console.log(`  （参考）${TREE_DESIGN_TRIALS[key].label}：${show("ツリー", rows.filter((r) => r.key === key && r.arm === "tree"))} ／ ${show("1本", rows.filter((r) => r.key === key && r.arm === "single"))}`);
  }
  console.log(`  （参考）案内あり：${show("ツリー", rows.filter((r) => r.arm === "tree" && r.offer))} ／ 案内なし：${show("ツリー", rows.filter((r) => r.arm === "tree" && !r.offer))}`);
}
process.exit(0);
