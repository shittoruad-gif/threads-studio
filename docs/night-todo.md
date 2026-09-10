# 夜間整備への申し送り

朝の点検（`threads-studio-daily-check`）で見つけたが、日中は本番に反映しないため夜へ回したもの。
片づいた項目は消してよい。

---

## 2026-09-10 夜間整備で残ったもの（三上様の判断待ち）

### A. 小林武晴様の「強み・実績」の言い換え（送信していません）

- 9/8に `healthClaimGuard` が同日2件発動（`治る・改善の断定` を落とした userId=3200）。
  安全運用ルールの「同じアカウントで1日2件以上なら、はじめの設定の『強み・実績』に結果表現が多い」に該当。
- なお、この件を伝える自動メール（「【Threads Studio】「強み」の書き方についてのご提案」）は
  9/9 01:19 に**送信に失敗**している（Coolifyのプレビュー用 `RESEND_FROM_DOMAIN=resend.dev` を拾い、
  Resendのテスト制限で拒否）。同日に再送されて到達済み。
- 文面は用意ずみ（下記）。**三上様の承諾をいただいてから**お送りします。

### B. 佐々木竜也様（9/9ご登録・pro）の登録内容が業種と食い違う（送信していません）

- 業種「コンサルタント」に対し、お客さん像に「デスクワークの会社員」、強みに「専門特化（〇〇専門）」と
  治療院の言葉が入っている。お店の情報が未完成のため投稿はまだ作られていない。
- 業種ズレの重複通知は止まっている（`industryMismatchNoticeKey` が効いていることを9/10に確認。
  9/9 01:23 を最後に同じ通知は出ていない）。
- 文面は用意ずみ。**三上様の承諾をいただいてから**お送りします。

### C. Coolifyの環境変数 `RESEND_FROM_DOMAIN=resend.dev` を消す（運営作業）

- 本番の実行中コンテナは `threads-studio.com` を正しく読めていることを9/10に確認済み。
  重複しているのは**プレビュー用（`is_preview: true`）の1件**（uuid `nioepcaeeyhgczsx70vyhydx`）。
- ただし9/9 01:19 のデプロイ中に実際にこちらが拾われ、お客様宛メールが1通落ちている。
  無害ではないので消したほうがよいが、環境変数の削除は本番設定の変更なので夜間整備では触らなかった。

---

## 恒常のメモ

- LINEの月間通数はコミュニケーションプラン（5,000通）。朝の点検に残量が出るようになった（残り1割で警告）。
  通数切れのときは、お客様へは同じ内容がメールで届き、運営にも1日1回知らせが飛ぶ。

---

## 2026-09-10 朝に直した分（コミット済み・**未push＝未デプロイ**）

`bd320b8 案内文の「20問」を実態に合わせる／生成プロンプトと identityGuard の矛盾を解消`

**今夜の夜間整備で、まずこれをpush＋デプロイすること。**
（mainへのpushは `*/5 * * * * /opt/scripts/auto-deploy.sh` で5分以内に自動デプロイされる＝
日中は押せないため手元に留めてある。同じく別セッションの `2711122` も未pushで残っている）

### 1. 「5問に直したのに20問と案内される」（三上様指摘）
9/10未明はLINEの入口2か所しか直しておらず、案内文が13か所ほど「20問」のままだった。
公式LINE＝まず5問／アプリの画面（/ai-counseling）＝今も全20問、と経路ごとに書き分けた。
5問へ直した：`nextAction.ts`（毎朝8:30の案内）・`onboardingEmailJob.ts`（ご案内メール2か所）・
`productKnowledge.ts`（自動応答の知識2か所）・`Landing.tsx`（公開LP。所要も10〜15分→2分）。

### 2. identityGuard の真因（前夜の見立ては外れていた）
9/10朝は 24生成・11失敗（前日 19生成・14失敗）と改善したが、`identityGuard` の作り直しは
19件で失敗の最大要因のまま。前夜入れた「リライトが削ったら戻す」対策は**0回**しか
発火していなかった＝リライトではなく**生成の時点で店名も地名も入っていない**のが原因。
プロンプトが正面から矛盾していた（生成側「毎回・1行目に無理に入れない」／検査側「1つ必須」）。
生成プロンプトに `identityTokens` を渡して必須条件にした。

**デプロイ後に見ること**：翌朝の `[AutoPost] Complete` と
`docker logs | grep -c "identityGuard: この店を指す言葉が無い"`。19件から減っていれば成功。

## 2026-09-10 昼（三上様指示：プレステージ様の補填）

- マイグレーション `0081_account_extra_posts.sql` で threadsAccounts に `extraPostsPerDay / extraPostsUntil / extraPostsReason` を足し、同じファイルで account 22（@esthe_prestige_r）に「9/11〜9/16は1日＋1件」を入れる。
- デプロイ後に確認すること:
  - [ ] `SELECT id, extraPostsPerDay, extraPostsUntil FROM threadsAccounts WHERE id=22` が 1 / 2026-09-16 になっている
  - [ ] 9/11 6時の生成ログに `[AutoPost] account 22 補填: 9/8〜9/10に届かなかった6件の補填（9/11〜9/16は1日4件）（契約3→4）` が出て、承認カードが4件届く（4件目は昼12時台）
  - [ ] 7:40の件数報告に補填の注記が出る
- 設定・解除は `scripts/ops/set-extra-posts.mts`。

## 2026-09-10 昼（三上様指示：自動にしますかの案内）

- 毎朝8:35 JST `auto_mode_nudge`（server/autoModeNudgeJob.ts）。migration `0082_auto_mode_nudge.sql`（users.autoModeNudgeAt / autoModeNudgeCount）。
- デプロイ後に確認すること:
  - [ ] 9/11 8:35 のログ `[AutoModeNudge] 送信 N件 / 対象 M人`。送った相手と理由が出る
  - [ ] 「自動にする（確認なし）」を押した方の users.autoPostRequireApproval が 0 になり、翌朝の投稿が承認カードなしで pending で作られる

## 2026-09-10 昼（三上様「すべてお願いします」：使いやすさ3件）

- 朝のLINEを1通に統合：`morning_digest`（7:40 JST・server/morningDigestJob.ts）。7:40 件数報告・8:30 次にやること・8:35 自動にしませんか の cron は外した（関数は残っている）。jobRunner の追い実行リストも `morning_digest` に差し替え。
- Meta AI呼びかけ：7日間使っていないアカウントは送信停止＋一度だけお知らせ（migration `0083_meta_ai_call_pause.sql`、threadsAccounts.metaAiCallPausedAt）。9/10昼の実測で0件のまま7日以上なのは @shittoru_official・@shin_honetugi・@angyomori・@black_eyes_1896・@shittoru.1203（@desire_6981 は連携7日未満）。
- アプリの「お店の情報」入口はLINEへ（SetupChecklist・OnboardingStart）。
- デプロイ後に確認すること:
  - [ ] 9/11 7:40 ログ `[MorningDigest] 送信 N件（やること付き M件）`。8:30／8:35 に別の通知が出ていないこと
  - [ ] 9/11 10:00 ログに `送信停止` が出て、対象の方に「再開する」ボタン付きの一言が1回だけ届く
  - [ ] ダッシュボードの手順2が「お店のことをLINEで教える／LINEを開く」になっている（スマホ幅で崩れなし）

## 2026-09-10 夜（三上様「それで進めて」：自動補填）

- 届かなかった枠は翌朝＋1〜2件で自動補填（migration `0084_auto_carry_over.sql`、threadsAccounts.shortfall*/carry*、shared/accountRamp.ts carryOverCount）。手動の補填（extraPosts*）と合わせて1日＋2件まで。
- 0081 に 廿日市天神整体院（account 24）9/12〜9/17 1日＋1件 を追加（9/9・9/10の6件分）。
- 最後の作り直しで店名・地名が無い枠は署名を足して届ける（autoPostScheduler identityGuard）。
- デプロイ後に確認すること:
  - [ ] 9/11 6時のログに `届かなかった枠 N件 → 明日の生成で自動補填` と、9/12 6時に `自動補填: 昨日届かなかった…` が出る
  - [ ] 9/12 7:40 の報告に「今日の投稿に足しています」が出る
  - [ ] 9/11の全体で「3回目で落ちた枠」が減っているか（9/10は14枠）

## 2026-09-10 夜（三上様：代わりを作る／お知らせの出し分け）

- 見送りの返事に「代わりを作る」（postback `a=alt&i=`）。`generateReplacementPost`（autoPostScheduler）が見送った下書きと同じ切り口を避けて同じ枠に1本作り、承認カードを返す。1分ほどかかるので reply→push の切り替えで届く。
- 9/11のお知らせは `renderAnnouncement(a, ctx)` で、プラン・公開前の確認・Meta AIの設定に当てはまる段落だけを番号を振り直して出す。控えは `scripts/ops/announcements/2026-09-11_morning_digest.txt`（4パターン）。
- デプロイ後に確認すること:
  - [ ] テスト用アカウントで「見送り」→「代わりを作る」→ 新しいカードが届く
  - [ ] 9/11 7:40 のお知らせが、ライトの方にMeta AIの段落なし・自動（確認なし）の方に承認カードの話なしで届いている

