/**
 * 同じ直しのくり返し（読むだけ・誰にも送らない）。夜間整備 §3.47 で毎晩見る。
 * 2026-10-08 三上様「こういうのを毎晩のメンテナンスで改善しないと意味なくない？」
 *   npx tsx scripts/ops/edit-recurrence-report.mts [日数=21]
 *   npx tsx scripts/ops/edit-recurrence-report.mts 21 --verify [--accounts 25,31]
 *     … くり返しがあるアカウントごとに、今のコードで2本試し生成（保存しない）し、まだ同じ直しが要るかを見る。
 *       直したあとは必ずこれで「直った」を確かめてから報告する。
 *
 * アカウントごとに：手直しの数／くり返している直し（3組以上）／最新の生成（直していない文を含む直近5本）に
 * 「消す」言葉がまだ出ているか、「足す」言葉がまだ入っていないか。まだ出ていれば「直っていない」。
 */
const VERIFY = process.argv.includes('--verify');
if (VERIFY) process.env.AUTOPOST_DRY_RUN = '1'; // 試し生成は保存しない（server を読む前に立てる）
const onlyArg = process.argv.indexOf('--accounts');
const ONLY = onlyArg > 0 ? String(process.argv[onlyArg + 1] || '').split(',').map(Number).filter(Boolean) : [];
const db: any = await import('../../server/db');
const { recurringEdits } = await import('../../shared/editLessons');
const { sql } = await import('drizzle-orm');
const d = await db.getDb();
const days = Number(/^\d+$/.test(process.argv[2] || '') ? process.argv[2] : 21);
const verifyResults: string[] = [];
const accts: any[] = ((await d.execute(sql`
  SELECT sp.threadsAccountId a, sp.userId u, ta.threadsUsername name, COUNT(*) n
  FROM scheduledPosts sp JOIN threadsAccounts ta ON ta.id = sp.threadsAccountId
  WHERE sp.editedByUserAt >= UTC_TIMESTAMP() - INTERVAL ${days} DAY AND sp.originalContent IS NOT NULL
  GROUP BY a, u, name HAVING n >= 3 ORDER BY n DESC`)) as any)[0];
const norm = (s: string) => String(s || '').replace(/[\s　]/g, '');
let flagged = 0;
for (const x of accts) {
  const pairs = (((await d.execute(sql`SELECT originalContent b, postContent a, editedByUserAt e FROM scheduledPosts
    WHERE threadsAccountId = ${x.a} AND editedByUserAt >= UTC_TIMESTAMP() - INTERVAL ${days} DAY AND originalContent IS NOT NULL
    ORDER BY editedByUserAt DESC LIMIT 20`)) as any)[0] as any[]).map((r) => ({ before: String(r.b), after: String(r.a), at: new Date(r.e).getTime() }));
  const rec = recurringEdits(pairs);
  // 契約が終わった方は生成が止まっているので、直す対象にしない（10/10 #17 氷見様＝10/2 解約で「まだ直っていない」と出続けた）
  const ended = await db.isEndedCustomer(Number(x.u));
  // 最新の生成（AIが作った文そのもの）。★その直しを最後にされた時より後に作られたものだけを見る
  //   （10/10 #26：直された投稿そのものが「直近5本」に入り、直した後の生成には出ていないのに「まだ直っていない」と出ていた）
  const recent = (((await d.execute(sql`SELECT COALESCE(originalContent, postContent) t, createdAt c FROM scheduledPosts
    WHERE threadsAccountId = ${x.a} AND source = 'auto' AND postContent IS NOT NULL ORDER BY id DESC LIMIT 40`)) as any)[0] as any[])
    .map((r) => ({ t: norm(r.t), at: new Date(r.c).getTime() }));
  const latestFor = (e: { kind: string; text: string }) => {
    const k = norm(e.text);
    const lastEdit = Math.max(0, ...pairs.filter((p) => e.kind === '消す'
      ? norm(p.before).includes(k) && !norm(p.after).includes(k)
      : norm(p.after).includes(k) && !norm(p.before).includes(k)).map((p) => p.at));
    return recent.filter((r) => r.at > lastEdit).slice(0, 5).map((r) => r.t);
  };
  const still = rec.filter((e) => {
    const latest = latestFor(e);
    if (latest.length === 0) return false; // 直した後の生成がまだ無い
    return e.kind === '消す' ? latest.some((t) => t.includes(norm(e.text))) : e.count * 2 >= pairs.length && latest.every((t) => !t.includes(norm(e.text)));
  });
  if (rec.length > 0 && !ended) flagged++;
  console.log(`\n#${x.a} @${x.name}  手直し${x.n}本（${days}日）${ended ? '  ※ご契約終了（生成は止まっている・対象外）' : ''}`);
  if (rec.length === 0) { console.log('  くり返している直し：なし'); continue; }
  for (const e of rec) {
    const n = latestFor(e).length;
    console.log(`  ${e.kind}「${e.text}」 ${e.count}回${ended ? '' : still.includes(e) ? `  ← 直した後の生成${n}本でまだ直っていない` : n === 0 ? '  （直した後の生成がまだ無い）' : ''}`);
  }
  if (ended) continue;
  if (VERIFY && (ONLY.length === 0 || ONLY.includes(Number(x.a)))) {
    const { generateAutoPost } = await import('../../server/autoPostScheduler');
    const acc: any = await db.getThreadsAccountById(Number(x.a));
    // 紐付けの無い1アカウントの方は、本番と同じくご本人のお店の情報で作る（10/8 #17 がとばされていた）
    const project = acc?.defaultProjectId ? await db.getProjectById(acc.defaultProjectId)
      : acc ? ((await db.getUserProjects(acc.userId)) as any[])[0] ?? null : null;
    if (!acc || !project) { console.log('  試し生成：お店の情報が無いためとばす'); continue; }
    const made: string[] = [];
    for (let k = 0; k < 2; k++) {
      let got: any = null;
      for (let t = 1; t <= 3 && !got; t++) await generateAutoPost(acc.userId, project, k, k, Number(x.a), k, false, null, acc.postLength ?? null, new Date(Date.now() + 86400e3), null, t === 3, false, { collect: (c: any) => { got = c; } } as any);
      if (got?.content) made.push(String(got.content));
    }
    const m = made.map(norm);
    // 「消す」は1本でも出たら直っていない。「足す」は2本とも入っていなければ直っていない（毎回入れる言葉だけを見るため）
    //   「足す」は、手直しの半分以上で足している言葉だけを見る（話の流れで時々足す言葉は毎回入らなくてよい）
    const bad = rec.filter((e) => e.kind === '消す' ? m.some((t) => t.includes(norm(e.text))) : e.count * 2 >= pairs.length && m.length > 0 && m.every((t) => !t.includes(norm(e.text))));
    const line = `#${x.a} 試し${made.length}本：${bad.length === 0 ? 'くり返しの直しは出なかった' : `まだ要る直し ${bad.map((e) => `${e.kind}「${e.text}」`).join('・')}`}`;
    verifyResults.push(line);
    console.log(`  ${line}`);
    for (const t of made) console.log(`    ―― ${t.replace(/\n+/g, ' / ').slice(0, 160)}`);
  }
}
if (VERIFY) console.log(`\n試し生成の結果：\n${verifyResults.join('\n')}`);
console.log(`\nくり返している直しがあるアカウント：${flagged}/${accts.length}`);
process.exit(0);
