# 約束台帳（お客様に送った文面どおりに動いているかを、毎朝の点検で確かめる）

2026-09-11 三上様「きちんと今日送った通りにすべて進めてくださいね」。送った約束は必ずここに書き、朝の点検 §2.7 で当日分を確認して報告する。守れていなければ、その日のうちに当日補充（scripts/ops/fill-shortfall.mts）か、訂正の連絡（三上様承諾）。

| お客様（account） | 送った文面の約束 | 仕組み上の担保 | 確認日 |
|---|---|---|---|
| 香取様（21・ライト） | 9/11 に 2件。9/12 から通常1件。同じ言い回しを避ける | extraPostsUntil=9/11、#1297・#1298 承認待ち（10:01/10:07） | 9/11 公開されたか（承認されなければ翌日へスライド）／9/12 1件 |
| 滝本様（11） | 9/12〜13 4件、9/14 から3件（9/11 も4件届いている） | extraPostsUntil=9/13 | 9/12・9/13 4件、9/14 3件 |
| 髙木様（15 金沢） | 9/12 4件、9/13 から3件（9/11 も4件） | extraPostsUntil=9/12 | 9/12 4件、9/13 3件 |
| 髙木様（16 ダイエット） | 連携11日目（9/12）から3件＋慣らしで減った分を1日1件足す | rampForAccount の自動補填（＋1・30日で契約×30） | 9/12 4件 |
| 氷見様（17） | 9/12〜13 4件、9/14 から3件 | extraPostsUntil=9/13 | 9/12・9/13 4件 |
| 岩根様（25） | 9/12〜14 4件、9/15 から3件 | extraPostsUntil=9/14 | 9/12〜14 4件 |
| プレステージ様（22） | 9/11・12 は2件（慣らし）、9/13〜18 4件、9/19 から3件（訂正文送付済み） | 慣らし10日目まで cap 2、extraPostsUntil=9/18、30日未満は契約＋1まで | 9/12 2件、9/13〜18 4件 |
| 小西様（24） | 9/11・12 は2件（慣らし）、9/13〜18 4件、9/19 から3件（訂正文送付済み） | 同上 | 同上 |
| 全員（9/11 お知らせ） | 作れなかった日は翌日に自動で1〜2件足す／Meta AI 呼びかけは7日未使用でお休み・設定から再開／「自動にしませんか」は押さなければ何も変わらない | carryOverCount／metaAiCallPausedAt／autoModeNudge | 9/12 7:40 の報告に「今日の投稿に足しています」が出るか |

## 確認のしかた（朝の点検）
```
# 今日の自動投稿の本数（アカウント別）と、補填・慣らしの状態
ssh root@163.44.103.9 "docker exec n11p9np5jadgountc2pp9gmg mysql --default-character-set=utf8mb4 -umysql -p'<pw>' threads_studio -e \"
SELECT ta.id, ta.threadsUsername, ta.extraPostsUntil, DATEDIFF(NOW(), ta.createdAt) days,
  (SELECT COUNT(*) FROM scheduledPosts sp WHERE sp.threadsAccountId=ta.id AND sp.source='auto' AND sp.status IN ('awaiting_approval','pending','posted','processing')
     AND DATE(CONVERT_TZ(sp.scheduledAt,'+00:00','+09:00'))=DATE(CONVERT_TZ(NOW(),'+00:00','+09:00'))) today
FROM threadsAccounts ta WHERE ta.isActive=1 ORDER BY ta.id\""
```
台帳の「確認日」の本数と一致しなければ、`scripts/ops/fill-shortfall.mts --fill <userId>` で当日補充し、それでも届かなければ三上様へ報告。
