# 夜間整備への申し送り

朝の点検（`threads-studio-daily-check`）で見つけたが、日中は本番に反映しないため夜へ回したもの。
片づいた項目は消してよい。

---

## 三上様の判断待ち（送信していません）

### A. 小林武晴様の「強み・実績」の言い換え

- 9/8に `healthClaimGuard` が同日2件発動（`治る・改善の断定` を落とした userId=3200）。
  安全運用ルールの「同じアカウントで1日2件以上なら、はじめの設定の『強み・実績』に結果表現が多い」に該当。
- 文面は用意ずみ。**三上様の承諾をいただいてから**お送りします。
- 9/13追記：同じ条件に **userId=2907（24時間で4回・うち2回は公開見送り）と userId=556（3回）** も当てはまる。
  小林様（3200）は9/12は1回。優先順位としては 2907 → 556 → 3200。

### B. 佐々木竜也様（9/9ご登録・pro）の登録内容が業種と食い違う

- 業種「コンサルタント」に対し、お客さん像に「デスクワークの会社員」、強みに「専門特化（〇〇専門）」と
  治療院の言葉が入っている。9/13の朝の点検にも同じズレが出ている。
- 業種ズレの重複通知は止まっている（`industryMismatchNoticeKey`）。
- 文面は用意ずみ。**三上様の承諾をいただいてから**お送りします。

### C. Coolifyの環境変数 `RESEND_FROM_DOMAIN=resend.dev` を消す（運営作業）

- 本番の実行中コンテナは `threads-studio.com` を正しく読めている。重複しているのは
  **プレビュー用（`is_preview: true`）の1件**（uuid `nioepcaeeyhgczsx70vyhydx`）。
- 9/9 01:19 のデプロイ中に実際にこちらが拾われ、お客様宛メールが1通落ちている。
  環境変数の削除は本番設定の変更なので夜間整備では触っていない。

### D. 自動投稿の必須条件を減らすか（2026-09-11）

- 「はじめの設定」は5問で終わるのに、自動投稿は今も **お客さん像（target）と強み（strength）** を必須にしている
  （`autoPostScheduler` の `eligibleProjects`）。
- 9/13の通し確認でも同じ：5問を終えた直後は target と strength が必ず空になる。
  案内は「あと2問だけ答える」で1本道になっており、進み具合の見出しも「（あと2問）」に直した（9/13）。
- 残るご判断：必須条件そのものを「業種・地域・お悩み」まで減らすと5問だけで投稿が始まるが、
  強みが無いぶん投稿は弱くなる。**要ご判断**（夜間整備では仕様は変えていない）。

### E. 投稿を「問いかけ」で締めるのをやめるか（2026-09-13）

- 直近30日で評価のついた22本を数えた：**問いかけで終わる投稿は 2◯/6✕、そうでない投稿は 5◯/9✕。**
- ✕が付いた直近12本のうち6本が「あなたはどうですか？」の形で終わっている
  （「あなたが『楽になった』と感じる瞬間は？」「どんなシーンで着物を着てみたいですか？」など）。
- ただし **母数が22本しかなく、これだけでは決められない**。いまは切り口ごとに
  問いかけ締めの可否を分けている（`allowQuestionEnding`）ので、全員の文体に関わる変更になる。
  **要ご判断**（夜間整備では変えていない）。

---

## 恒常のメモ

- LINEの月間通数はコミュニケーションプラン（5,000通）。朝の点検に残量が出る（残り1割で警告）。
  通数切れのときは、お客様へは同じ内容がメールで届き、運営にも1日1回知らせが飛ぶ。
- ローカルQAは port 3100（`QA_SAFE_MODE=1`）。DBはローカルMySQLなので本番には触れない。
  ポートが埋まっていると勝手に 3101 へ逃げるので、確認の前に**どちらを見ているか必ず確かめる**。
  `handlePostback` / `handleFreeText` を直接叩く確認は、`BUILT_IN_FORGE_API_KEY` と `BUILT_IN_FORGE_API_URL`
  を Coolify の env から渡さないと自動応答が動かない（`.env` には入っていない）。
- LINEの総当たりは `scripts/ops/line-sweep.mjs`。**値を取るボタンは必ず値を付けた形で書くこと**
  （`c=st` のように前半だけ書くと、アプリは正しく「うまく受け取れませんでした」と返すので、
  こちらの書き間違いが不具合のように見える。2026-09-13 に一度そう見誤った）。
- ⚠️ **マイグレーションの適用済み判定はファイル名だけ**（`server/_core/index.ts`・中身のハッシュは見ない）。
  一度本番に当たったマイグレーションのファイルを後から書き換えても、**二度と実行されない**。
  直したいときは必ず新しい番号のファイルを足すこと。
  （0085 は本番未適用のうちに書き換えたので影響なし。ローカルだけ古い版が当たっていた）
- auto-deploy はサーバー側の cron（5分ごと・`/opt/scripts/auto-deploy.sh`）。**push すれば勝手に反映される**ので、
  手で `api/v1/deploy` を叩くと二重デプロイになる。トークンを入れ替えたら
  `~/.claude/secrets/coolify.token` と `/opt/scripts/.coolify-token` の両方を直す。
  確認は `tail /var/log/auto-deploy.log` に `Unauthenticated` と `[FAIL]` が無いこと。

---

## 2026-09-13 未明にデプロイした分（翌朝に見ること）

昼のうちにコミットだけしてあった4件（承認なし公開・ご案内先URLの判定・スパム判定の精度）と、
夜間整備で直した5件をまとめて反映。

### 昼の分（9/12）の確認
- [ ] executor ログに `見送りなしのため公開へ: N件／日をまたいだ承認待ちを見送り: M件` が出る。
      9/13時点の承認待ちは6件（三上様の871＝8/31作成、香取様の1297・1298・1346・1353・1357）。
      **全部「日をまたいだため見送り」になるはず**（当日分だけが公開に回る仕様）
- [ ] 7:40 のお知らせ（`publish_unless_declined_2026-09-13`）が公開前確認ONの方に届く
- [ ] 固定投稿のコメントに「ふだんの様子」が Instagram 以外で出ない
- [ ] `Follow-up bump scheduled` が出ない／`inquiry comment skipped …（本日2件目以降）` が出る
- [ ] 7:40の報告で、しっとる公式に「投稿が消されたため9/19まで1日1件」の注記

### 夜の分（9/13）の確認
- [ ] `[AutoPost] 書き出しが直近の投稿と同じ実績の数字「◯年」→ 作り直し` が出る。
      出すぎ（1人で毎枠）になっていないか。**出ても最後の作り直しでは止めないので、枠は減らない**
- [ ] `[PinnedFlow] 固定投稿の品質: … → 作り直し` が出たときに、ちゃんと3回以内で通っているか
- [ ] 会員登録が 375px で最後まで押せる（Cookieのお知らせの下にボタンが隠れない）

---

## 2026-09-13 未明の通し確認で見つけて直した分

ローカルQA（port 3101）で、新しいお客様の目線でひととおり操作した結果。

- [x] **スマホで会員登録の「アカウント作成」ボタンが押せなかった**。Cookieのお知らせが画面の下に
      貼り付く（fixed・高さ276px）ため、フォームの一番下まで送っても、同意チェックのすぐ下にある
      ボタンがお知らせの下に隠れていた（375×812 も 375×667 も同じ。実測で
      `elementFromPoint` がお知らせの文章を返す）。お知らせが出ているあいだは同じ高さだけ
      ページの下に余白を足して、必ず上へ逃がすようにした（`CookieConsent.tsx`）。
- [x] **固定投稿の生成に、毎日の投稿にかけている品質検査が1つもかかっていなかった**。
      `pinnedPostFlow.ts` に `findBannedTic` も `checkNaturalized` も `healthClaimGuard` も無く、
      その場で作った1本目に「諦めていませんか？」（人の投稿には出てこない決まり文句）が入っていた。
      固定投稿はプロフィールの一番上に置きっぱなしになる、いちばん人目に触れる投稿なので、
      3回まで作り直す形で同じ検査をかけた。**作り直しても直らないときは下書きとしてお見せする**
      （手ぶらで帰さない。公開はご本人が押したときだけ）。実測で3本中1本が作り直しになり、3本とも合格。
- [x] **同じ実績の数字で書き出す投稿が続くのを止める**。香取様の「ここ数日は同じ内容でした」
      （supportQuestions #30）に対し、9/11に入れた使い回し判定（10文字の一致）は
      **実物5本を1件も拾えていなかった**（一字一句は違うため）。読む側に同じに見える正体は
      「11年」という実績の数字で毎回書き出していたこと。書き出し45字の中の数字を見る判定を足した
      （`findRepeatedHookNumber`）。本番の実投稿370本で試して16.2%が作り直しになる見込み。
      中身を読むと、acct12「猫背を悪化させる習慣、3つあります」の重複、acct14「SNS投稿が続かない
      お店の共通点、3つあります」の5回など、**止めるべきものが当たっている**。
      最後の作り直しでは止めないので、枠は捨てない。
- [x] **「明日は臨時休診です」が、何も受け取っていない返事に落ちていた**。
      9/11に香取様へ「出してほしい話題はそのまま送ってください」とお伝えしているのに、
      短い言い切りはご質問にもご依頼にも当たらず「ご用件を下から選んでください」で終わっていた。
      お知らせだと分かるものを受け取り、①今日の投稿の書き直しに入れる ②アプリの「イベント」に
      登録すると14日前・7日前・3日前・前日・当日の残っている分だけお知らせ投稿を作る、の
      2つをお伝えするようにした（`looksLikeAnnouncement`）。知識（`productKnowledge`）にも足したので、
      長い文でご相談いただいた場合も同じ内容で答える（実測で一致を確認）。
- [x] **「設定が終わりました」と言いながら、同じ画面で「□ お店の情報を登録」が未完のままだった**。
      5問を終えた方には「□ お店の情報を登録（あと2問）」と出すようにして、本文・ボタンと揃えた。

### 確認できたこと（問題なし）
- 会員登録 → ログイン → 料金プラン →「このまま無料で始める」まで、**ポップアップを遮断した状態でも同じタブで進める**。
- 375px で主要22ページに、**ページ全体の横スクロール・JSエラー・空表示なし**。
  （`/pricing` の比較表と `/post-history` の飾りは `overflow-x:auto` / `hidden` の中なので、はみ出しではない。
  QAスクリプトはページ全体の `scrollWidth` で判定するように直した）
- LINEのボタン83種すべて応答あり（無反応・「うまく受け取れませんでした」ゼロ）。
- 「はじめの設定」は5問を最後まで通せ、確認画面 →「この内容で登録する」→ 次にやること まで正常。
- 固定投稿は 作る →「これで投稿する」→ 公開予定 → ピン留めの手順案内（`n=pinhow`）→ 記録（`n=pinned`）まで通る。

---

## 前の夜から残っている宿題

### ★★ 2026-09-13 三上様決定「これら全てを今夜アップデートしてください」（7つのルール＋文言バグ）

決定済み。判断待ちは無い。下の順に実装し、テストを付け、`docs/safe-operation-rules.md` 追記 2026-09-13 と一致させる。
5時までに終わらなければ、終わった分だけをデプロイし、残りを翌夜へ。

**★9/13 日中に R1〜R8 のコードは実装・コミット済み（反映はしていない）。今夜やることは次の4つ。**
1. `git log --oneline @{u}..HEAD` で日中のコミットを読む（台帳・ルール・R1〜R8 の実装・送信スクリプト）
2. ローカルQA（port 3100）で `drizzle/0087_daily_cap_approval_record.sql` が当たること、`SHOW COLUMNS FROM scheduledPosts LIKE 'approved%'`、
   `SHOW COLUMNS FROM threadsAccounts LIKE 'deletedShortfall'` を確認。LINE の a=ok / a=okall で approvedAt・approvedVia が入ることを `handlePostback` 直接呼びで確認
3. `npx tsc --noEmit -p tsconfig.json`（9/13 日中：エラー0）と `npx vitest run`（9/13 日中：769件通過・失敗0、`server/dailyCap.test.ts` 10件を含む）が変わっていないこと
4. デプロイ → 本番で 2 の SHOW COLUMNS → 翌 6:00 のログで `今日すでにN件（翌日へ送られた分など）` と `daily cap (` が出ているか、7:40 のまとめで案内OFFの岩根様にも announcements の段落が入る経路になっているか（9/14 はお知らせ無しなので空でよい）
実装の要点（夜に読み直す用）：`shared/dailyCap.ts`（純関数・文言）／`server/dailyCapCheck.ts`（契約本数→上限）／`server/scheduledPostExecutor.ts`（全アカウント上限・翌日へ送る・R8文言）／
`server/db.ts`（promoteSoftApprovedDuePosts＝全員見送り＋auto_soft 記録・countAccountAutoPostsPostedToday・deferTodaysAutoPostsBeyond・deletedShortfall・listUserIdsForAnnouncement）／
`server/accountHealthJob.ts`（R5 定型文・R6 補填・当日の残りを1件に）／`server/morningDigestJob.ts`（R3 案内OFFにも・LINE未連携はメール）／
`server/autoPostScheduler.ts`（翌日へ送られた分を先に数える・deleted 補填の消化）／`server/accountRampCheck.ts`（reason・deletedShortfall）／
`server/lineChatHandler.ts`・`server/routers.ts`（approvedAt/approvedVia）。

- [ ] **R1 全アカウントに1日の公開上限。** 上限＝契約本数＋補填分（手動 extraPosts と自動 carry の合計は MAX_EXTRA_PER_DAY=2 まで）。
      `server/scheduledPostExecutor.ts` の ramp cap ブロックを「慣らし・冷却のときだけ」から「全アカウント」に広げる。
      数えるのは自動投稿（source='auto'・自己返信/引用を除く）の当日公開済み。手動投稿は数えない（慣らし・冷却中だけ今までどおり Threads 実測で手動込み）。
      超えた分は**見送りにせず翌日の枠へ送る**（scheduledAt を翌日の bestHours 先頭へ・status はそのまま）。翌日の生成は「翌日へ送られた分」を先に数えて新規を減らす。
      ログ `[Scheduled Post] daily cap: account N today=X cap=Y → post ID moved to <日時>`。LINE通知は出さない（朝のまとめに「昨日の分を今日に回しました」1行）。
- [ ] **R2 日をまたいだ承認待ちは全員見送り。** `db.promoteSoftApprovedDuePosts` の expire 条件から `u.autoPublishIfNoResponse = 1` を外す（OKした分だけ公開の方も同じ）。
      固定投稿（angle='pinned'）は対象外のまま。見送り理由「承認されないまま日をまたいだため見送り（翌朝また新しい投稿が届きます）」。
      香取様（21）の承認待ち5件はこれで整理される。翌朝の生成は残っている承認待ちを数えない（すべて見送り済みになるため）。
- [ ] **R3 仕組みの変更のお知らせは案内OFFの方にも届ける。** `server/morningDigestJob.ts`：announcements の段落は `notifyEnabled`（案内OFF）に関係なく送る。
      LINE未連携の方には同文をメール（`email_logs` に残す）。案内OFFで止めるのは「次にやること」「自動にしませんか」だけ。
      9/13 のお知らせ未着の 岩根様（案内OFF）・小林様（LINE未連携）は 9/13 日中に手動送付済み → `lastAnnouncementKey` を `publish_unless_declined_2026-09-13` に更新して二重送信を防ぐ。
- [ ] **R4 「今日から」のお知らせは反映確認後に送る（運用ルール・コードは shared/announcements.ts に sendOn の前提を注記）。**
      `announcementForToday()` は `sendOn` が「デプロイ済みコミットの翌日以降」であることを前提にする旨をコメントに明記。
      朝の点検 §2 に「Coolify デプロイ記録（GET /api/v1/deployments/applications/<uuid>）で反映を確認してから、お知らせが送られたかを見る」を追記。
- [ ] **R5 投稿が消されたときの当日連絡を定型化＋冷却に入った日は残りの予定も1件に。**
      `server/accountHealthJob.ts`：消失検知時の LINE 文面を 9/13 に髙木様へ送った文を型にする（承諾済み定型）。
      「@X で公開した投稿のうちN件がThreads側で削除されていました。アカウントを守るため MM/DD まで自動投稿を1日1件に抑えます。減った分と消えたN件は、その翌日以降に1日1件ずつ足してお届けします。この期間、ご自身の手動投稿も1日1〜2件に留めてください。」
      同時に、その日の残りの pending/awaiting（source='auto'）を1件だけ残して翌日以降へ送る（R1 の「翌日へ送る」を使う）。
- [ ] **R6 消された投稿の補填キュー。** `threadsAccounts` に `deletedShortfall INT DEFAULT 0` を追加（新番号 0087）。
      `accountHealthJob` が検知した消失件数を加算。冷却で減った分は既存の compensationCount（連携30日以内）が拾うが、30日を超えたアカウントは拾えないので、
      冷却中に「契約−1」×日数を `deletedShortfall` に加算する。冷却明けから `rampForAccount` が `deletedShortfall > 0` のとき契約＋1件を返し、1件消化ごとに減らす。
      髙木様（16）：冷却 9/13〜9/20（8日×2件）＋消失3件＝19件 → 9/21 から1日4件。しっとる公式（14）は自社なので補填しない（deletedShortfall を積まない例外＝userId 78）。
- [ ] **R7 承認の記録。** `scheduledPosts` に `approvedAt TIMESTAMP NULL`・`approvedVia VARCHAR(20) NULL`（'line_one' / 'line_all' / 'web' / 'auto_soft' / 'web_edit'）を追加（0087 に同梱）。
      書く場所：lineChatHandler `a=ok`・`a=okall`、routers `approve`・`editContent`、db `promoteSoftApprovedDuePosts`（auto_soft）。
      管理画面の投稿一覧に「承認：9/13 18:13 LINE（1件）」を出す。
- [ ] **R8 冷却中に止めたときの LINE 文言を直す（9/13 三上様指摘「連携1日目で慣らし運転中」）。**
      `server/scheduledPostExecutor.ts` の ramp cap 通知：`rc.days === 0 && inCooldown(account)` のときは
      「@X は投稿が消されたため MM/DD まで1日1件に抑えています（アカウントを守るため）。今日はすでに1件公開したので、この投稿は翌日に回しました。」
      `server/accountRampCheck.ts` の冷却分岐は `days` を 0 でなく `-1` 等の「慣らしでない」印にするか、`reason: 'cooldown'` を返す。テストに 9/13 の acct14 の事例を入れる。
- [ ] 上記を `docs/safe-operation-rules.md`「追記 2026-09-13」と一致させ、説明書（shittoru-service-docs / service-catalog manuals.json）の「1日の本数」「確認カード」の記述を合わせる。
- [ ] デプロイ後の確認：`SHOW COLUMNS FROM scheduledPosts LIKE 'approved%'`／`SHOW COLUMNS FROM threadsAccounts LIKE 'deletedShortfall'`／
      翌 6:00 の生成ログで「翌日へ送られた分」が数えられているか／7:40 の朝のまとめに案内OFFの方（岩根様）へ announcements が入るか（9/14 は新しいお知らせが無ければ空でよい）。

### 2026-09-13 追加（Moveact 両店の LINE 流入計測・Keiro）
- [ ] **Keiro（keiro-shittoru, Coolify uuid `x10e9syw5oydt9pqw6hqwiij`）を再デプロイする。** GitHub `shittoru-ad/keiro` は push 済み（webhook: KEIRO_FORWARD_TOKEN）。環境変数 `KEIRO_FORWARD_TOKEN` は Coolify に登録済み。
      VPS で `curl -H "Authorization: Bearer $(cat ~/.claude/secrets/coolify.token)" 'http://localhost:8000/api/v1/deploy?uuid=x10e9syw5oydt9pqw6hqwiij&force=true'`（トークンはローカルの secrets から渡す。VPS上に書かない）。
      デプロイ後の確認：`https://keiro.s-toru.com/` と `https://line.moveact.net/` が 200／コンテナログに `webhook received before channel secret is set` が **出なくなる**／
      Keiro DB `follows` の tenant `tnt_dbf11acd3ef4461b8157a21f`（玉島）`tnt_f990e5ee575ee176cbcde760`（金光）に翌日以降 1 件でも入る。
      デプロイ前に `docker exec <keiro> node scripts/backup.js` で控えを取る。
- [ ] 翌朝の点検で、Threads Studio の Moveact 2プロジェクトの `ctaLink` が `lnk_ma_tama_threads` / `lnk_ma_konko_threads` になっていること、
      6:00 生成後の「その日1件目のリンクコメント」がこのリンクで出ていることを確認（Keiro の clicks に `_threads` が増える）。

### ★最優先（2026-09-13 三上様「一日8件投稿やったらあかんやろ」）— 上の R1〜R8 に統合。以下は経緯の記録として残す
- [ ] **1日の上限を全アカウントに掛ける。** いまは公開時の上限チェック（`server/scheduledPostExecutor.ts` の ramp cap）が
      `rc.capped` のとき＝慣らし運転中か冷却中のアカウントにしか効かない。Threads歴の長いアカウントには上限が無く、
      9/12 に Moveact 10件・しっとる公式 8件・滝本様 8件・岩根様 8件が公開された（全体65件／平常38件前後）。
      契約本数＋補填分を上限とし、ご本人の手動投稿も数えて超えた分は公開せず見送る（翌日へ）。
- [ ] **前日の未確認カードが翌日に残り、当日分と合わせて契約本数を超える枚数が同じ日に届く。** 岩根様 9/12：
      9/11 の未確認4件＋9/12 の5件＝9件のカードが同日に届き、ご本人が夕方に8件を承認（追い投稿ゼロ・自動公開は未反映・
      8件ともご本人の操作）。生成時に「その日の予定＋残っている確認待ち」で本数を見る。
- [ ] **消された投稿の補填が自動では積まれない。** 品質で落ちた枠（`shortfallCount`）は補填されるが、
      公開後に Threads 側で消された分は記録されない。`accountHealthJob` が検知した消失件数を補填キューに積み、
      **冷却明けから1日＋1件ずつ**返す。髙木様（@miraiseitai.diet・3件消失・9/20まで冷却）に文面で約束する内容。
- [ ] **追い投稿は承認制でない方に承認なしで出ていた。** 滝本様（承認制なし・契約3件）は 9/4〜9/12 の8日間、
      毎日4〜8件（うち追い投稿1〜4件）。ご本人は3件のつもりで、実際はその倍。岩根様は 9/12 に8件（追い投稿0・繰り越し二重）。
      お客様への説明文は三上様承諾のうえ送付（文面は 9/13 朝の点検チャットに用意）。今後「契約本数の外で出るもの」は作らない。
- [ ] **承認の記録が残っていない。** 「これで投稿する」「すべて承認」「見送りなし公開（自動）」のどれで公開に至ったかを
      `scheduledPosts` に残す（approvedAt / approvedVia）。9/13 三上様「この人は本当に前日に承認していますか？」に、
      editedByUserAt と公開時刻から推定するしかなかった（岩根様 9/12 の8件中2件は本人の押下か自動かを区別できない）。
- [ ] 承認待ちが日をまたいで残っているとき、翌日の新規分と合わせた「その日の確認カード」が契約本数を超えないようにする
      （岩根様 9/12：前日分4件＋当日分5件＝9件のカードが同じ日に届き、夕方に8件承認→その晩にまとめて公開）
- [ ] 冷却に入った日は、その日すでに作ってある予定も1日1件まで絞る（今朝 acct16 は3件作られた。
      公開時の上限で2件はキャンセルされる見込みだが、承認カードだけ届いて公開されないのは分かりにくい）

- [ ] `naturalnessReview` が短い定型（「土浦で11年。」）に3/5を付け続ける。採点基準と生成プロンプトの整合を見る
      （9/12の24時間：2/5が11件・3/5が37件・4/5が11件・5/5が61件。3/5で落とすのはやめてあるので投稿は出ている）
- [ ] 文体のお手本（`styleSamples`）が空のまま3日以上の契約者が11名
      （しっとる広告・三上様・滝本様・髙木様・小林様・プレステージ様・小西様・比嘉優様・佐々木様・juria様・大木様）。
      毎朝の案内は出ている
- [ ] 手順書 `docs/runbook-quality-shortfall.md` と `scripts/ops/fill-shortfall.mts` を朝の点検 §2.7 で運用
- [ ] 代理店：9/15（月）9:05 に `[AgencyReport] 代理店契約なし` が出る／9:30 の社内報告に「公式LINEの月間枠」
- [ ] 資料台帳・Notionの代理店紹介資料の差し替え（ts-deck の pptx/pdf は再生成ずみ）
