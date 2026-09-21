/**
 * その日に「作り直し」で落ちた理由を数える（夜間整備 §3.45）。
 *
 * ★なぜスクリプトにしたか：手順書は `docker logs | grep` で数えることになっているが、
 *   本番のコンテナは再デプロイのたびに作り直され、それ以前のログが全部消える
 *   （9/19 20時・9/21 01:16 に実際に消えた）。9/22 未明の整備では6時の生成のログが
 *   09:52 の再デプロイで消えており、1件も数えられなかった。
 *   そこで理由を postRejectLog に残すようにし、ここではそれを読む。
 *
 * 使い方（SSHトンネルを張ってから）:
 *   nc -z localhost 13308 || ssh -fN -L 13308:10.0.1.7:3306 root@163.44.103.9
 *   eval "$(bash scripts/ops/prod-env.sh DATABASE_URL)"
 *   node scripts/ops/reject-reasons.mjs [時間数=24]
 *
 * 見るところ:
 *   「枠を捨てた」が3件以上のアカウント＝その日の公開が減っている（ゼロの恐れ）。
 *   同じ理由が続いているなら、生成側（プロンプト・自然化）を直す。★ガードは緩めない。
 */
import mysql from 'mysql2/promise';

const HOURS = Number(process.argv[2] || 24);

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  charset: 'utf8mb4',
  dateStrings: true,
});

const [rows] = await conn.query(
  `SELECT r.guard, r.threadsAccountId, a.threadsUsername, u.name AS userName,
          COUNT(*) AS n, SUM(r.gaveUp) AS gaveUp
     FROM postRejectLog r
     LEFT JOIN threadsAccounts a ON a.id = r.threadsAccountId
     LEFT JOIN users u ON u.id = r.userId
    WHERE r.createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    GROUP BY r.guard, r.threadsAccountId, a.threadsUsername, u.name
    ORDER BY gaveUp DESC, n DESC`,
  [HOURS],
);

console.log(`===== 直近${HOURS}時間の作り直し =====`);
if (rows.length === 0) {
  console.log('記録なし');
  console.log('※ postRejectLog は 2026-09-22 に入れたばかり。それ以前の分は残っていない');
} else {
  // 理由ごとの合計
  const byGuard = new Map();
  for (const r of rows) {
    const cur = byGuard.get(r.guard) || { n: 0, gaveUp: 0 };
    byGuard.set(r.guard, { n: cur.n + Number(r.n), gaveUp: cur.gaveUp + Number(r.gaveUp) });
  }
  console.log('\n■ 理由ごと（件数／うち枠を捨てた）');
  for (const [g, v] of [...byGuard].sort((a, b) => b[1].n - a[1].n)) {
    console.log(`  ${g.padEnd(22)} ${String(v.n).padStart(4)}件 / 枠を捨てた ${v.gaveUp}件`);
  }

  console.log('\n■ アカウントごと（枠を捨てた数の多い順）');
  for (const r of rows) {
    if (Number(r.gaveUp) === 0) continue;
    const who = `${r.userName || ''} @${r.threadsUsername || r.threadsAccountId}`;
    console.log(`  ${who.padEnd(34)} ${r.guard.padEnd(22)} ${r.n}回 / 枠を捨てた ${r.gaveUp}回`);
  }

  // ★同じ理由で3回落ちて投稿ゼロになった人（手順書が見ろと言っているもの）
  const zeroRisk = rows.filter((r) => Number(r.gaveUp) >= 3);
  console.log('\n■ ★同じ理由で3回以上「枠を捨てた」アカウント（その日の公開が減っている）');
  if (zeroRisk.length === 0) console.log('  なし');
  for (const r of zeroRisk) {
    console.log(`  ${r.userName || ''} @${r.threadsUsername || r.threadsAccountId}：${r.guard}（${r.gaveUp}回）`);
  }

  // 中身の内訳（同じ言い回しに戻っていないか）
  const [details] = await conn.query(
    `SELECT guard, detail, COUNT(*) AS n
       FROM postRejectLog
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ? HOUR) AND detail IS NOT NULL
      GROUP BY guard, detail
     HAVING n >= 2
      ORDER BY n DESC
      LIMIT 15`,
    [HOURS],
  );
  if (details.length > 0) {
    console.log('\n■ 2回以上くり返している中身（生成側が同じ型に戻っている印）');
    for (const d of details) {
      console.log(`  ${String(d.n).padStart(3)}回  ${d.guard}  ${String(d.detail).slice(0, 70)}`);
    }
  }
}

await conn.end();
