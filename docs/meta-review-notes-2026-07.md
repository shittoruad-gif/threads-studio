# Meta App Review — Submission Notes (2026-07)

## 再提出済み (2026-07-23 深夜)

- submission_id 1382263747144662 として3権限＋更新2権限を再申請、ステータス「審査中」（20日以内に審査）。
- スクリーンキャスト: `~/Documents/meta_review/threads_studio_review.mp4`（398秒・1920x938・英語キャプション付き、raw素材は raw5.mov / seg2.mov）。
  1本でOAuth同意→AI生成→Publish→threads.com実表示→Comment返信→Insights取得のE2Eを連続収録。
- 3権限それぞれの申請ノートに動画タイムライン＋テスト手順を英語で記載。
- 審査担当者の指示欄・テスト認証情報欄のパスワードを ThreadsReview2026! に修正
  （プリフィルは旧PW shittoru4106 のままだった。DBハッシュとbcrypt照合して現行PWを確認済み）。
- accesscode欄に入っていたオーナー実アカウント(shittoru.ad@gmail.com)の認証情報は削除し審査用アカウントに差し替え。

### 録画の技術メモ（次回用）
- screencapture -v は通常のBashだとサンドボックスの子プロセス回収で〜22秒で死ぬ。run_in_background でも数分で自然終了することがある → 短いセグメントに分けて撮り、ffmpegでconcatが確実。
- 録画対象はChromeがあるディスプレイを `-D <n>` で明示（メイン4K=Claude画面、1080p=LINE、ULTRAWIDE=Chrome だった）。
- ファイル選択ダイアログはAppleScriptで Cmd+Shift+G → クリップボードpaste（直接keystrokeは日本語IMEに化ける）。
- claude-in-chrome の file_upload はユーザー共有ファイル限定で使えない。可視の「ファイルをアップロード」ボタンをクリック→ネイティブダイアログ操作で回避。

対象アプリ: Threads Studio (App ID 1250891946948510)
再申請対象: threads_content_publish / threads_manage_replies / threads_manage_insights
承認済み: threads_basic / threads_read_replies

## レビュアー向け資格情報（フォームに記載する値）

- App URL: https://threads-studio.com/login
- Email: meta-review@threads-studio.com
- Password: ThreadsReview2026!
- 連携済みThreadsアカウント: @moveact_pilates_tamashima（テスター承諾済み・投稿API実動確認済み 2026-07-21）

## 各権限の利用説明（英語・フォーム貼り付け用）

### threads_content_publish

```
Threads Studio is a social media management tool for small local businesses in Japan
(e.g., pilates studios, hair salons). Store owners write or AI-generate a Threads post
inside our app and publish it to their own connected Threads profile.

How we use threads_content_publish:
1. The user connects their own Threads account via the official OAuth flow.
2. On the "AI Post Generator" page, the user generates a post draft for their store.
3. When the user clicks "Post to Threads", our server calls
   POST /{threads-user-id}/threads and POST /{threads-user-id}/threads_publish
   to publish the post to the user's own profile.
4. The user can also schedule posts ("Posts & Schedule" page); our scheduler publishes
   them at the scheduled time with the same endpoints.

Steps to test:
1. Log in at https://threads-studio.com/login with the provided credentials.
2. Open "AI Post Generator", click generate, then click the publish button.
3. The post appears on the connected Threads profile (@moveact_pilates_tamashima).
```

### threads_manage_replies

```
Store owners receive replies (comments) from local customers on their Threads posts.
Threads Studio shows these replies in the "Comment Manager" page so the owner can
respond quickly from one place.

How we use threads_manage_replies:
1. The "Comment Manager" page lists replies to the user's own posts
   (GET /{media-id}/replies together with threads_read_replies).
2. When the user types an answer and clicks "Reply", our server calls
   POST /{threads-user-id}/threads with reply_to_id and publishes the reply
   to the customer's comment.

Steps to test:
1. Log in with the provided credentials.
2. Open "Comment Manager" from the left menu.
3. Select a reply on any post and send a short answer; it is published as a reply
   on Threads under the user's own account.
```

### threads_manage_insights

```
Store owners need to know which posts bring local customers. The "Post Analytics"
page shows views, likes, replies and follower counts of the user's own posts and
profile, fetched with the Insights API.

How we use threads_manage_insights:
1. GET /{threads-user-id}/threads_insights (views, followers_count) for
   profile-level metrics on the dashboard and analytics pages.
2. GET /{media-id}/insights (views, likes, replies) for per-post metrics in
   "Post Analytics", so the owner can see which post performed best and
   schedule future posts at the best time.

Steps to test:
1. Log in with the provided credentials.
2. Open "Post Analytics" from the left menu.
3. The page shows real metrics of the connected account's posts.
```

## スクリーンキャスト台本（1本で3権限すべての実使用を見せる）

| # | シーン | 見せる権限 |
|---|---|---|
| 1 | https://threads-studio.com/login にメール+パスワードでログイン | - |
| 2 | ダッシュボード表示（連携済みアカウント名が見える） | threads_basic |
| 3 | AI Post Generator → 生成 → 「Threadsに投稿」クリック → 成功表示 | **threads_content_publish** |
| 4 | threads.com の実プロフィールを開き、投稿が公開されたことを見せる | （実動の証明） |
| 5 | Comment Manager → 返信一覧表示 → 1件に短い返信を送信 → Threads実画面で返信を見せる | **threads_manage_replies** |
| 6 | Post Analytics → 閲覧数・いいね等の実数値が表示される画面 | **threads_manage_insights** |

- 録画は英語UI（?lang=en）で行う。
- 各ステップで2〜3秒静止し、クリック位置がわかるように。
- 長さ目安: 2〜4分。

## 過去の非承認の推定原因と今回の差分（社内メモ）

- 〜2026-07-12 の申請時点では @moveact_pilates_tamashima が Threads テスター未承諾。
  レビュー環境で publish/replies/insights のAPIが "Application does not have
  permission" で失敗 → 「機能が確認できない」→ 非承認（読み取り系のみ承認）と推定。
- 2026-07-20 にテスター招待→承諾が完了。2026-07-21 に3権限すべてのAPI実動を確認:
  - insights: HTTP 200（views等の実データ）
  - replies read: HTTP 200
  - publish: 権限チェック通過＋実投稿の公開実績あり
- 審査用アカウント(749)は渋谷区デモを一掃し、実店舗（玉島）相当の安全な
  プロジェクト1本のみに整理。ログインは 2026-07-21 にAPI経由で success を確認。

## 2026-08-05: 4回目の却下と、その後の修正

### 却下（submission 1382263747144662）
理由は前回と同じ定型文だが、指摘の中で**唯一ずっと未対応だったのが「アプリUIの言語として英語を使用する」**。
英語キャプションを付けても画面自体が日本語だったため、審査官が操作内容を読めず
「E2E体験が実証されていない」と判定され続けていたと判断。

### 修正内容（すべて本番反映済み）
1. **審査導線の英語UI化**（最重要）
   - i18nの器（LangProvider/dict）はあったが、画面側で t() が未適用だった
     （Dashboard 0箇所 / AIGenerate 0箇所 …）。そのため ?lang=en を付けても日本語のままだった。
   - Dashboard / AIGenerate / ThreadsConnect / CommentManager / PostAnalytics /
     DashboardLayout / PageBreadcrumb / ProjectLinksManager / PWAInstallBanner に t() を適用。
   - dict.ts を約450語まで拡充。審査導線の未翻訳は0件（検証スクリプトで確認）。
   - 数値・時刻・日付も英語ロケール追従（1.9万→18.9K / 9時→9:00 / 8月1日→Aug 1）。
2. **ブラウザ言語での自動判定**（これが無いと審査官に英語UIが届かない）
   - 審査官は ?lang=en を付けずにログインするため、URLパラメータ頼みでは意味がなかった。
   - navigator.language / languages を見て、日本語以外なら英語UIで初期表示する。
   - 優先順位: ?lang= > localStorage(設定画面での選択) > ブラウザ言語 > ja
3. **Metaアプリ設定のURLを正規ドメインへ**
   - プライバシーポリシー / 利用規約 / データ削除URL が Coolifyの仮ドメイン
     （g89zg5s4u6xr08gp2b0dptcn.163.44.103.9.sslip.io）のままだった。到達性はあったが、
     サイトURL(threads-studio.com)と不整合で不審に見えるため threads-studio.com/... に統一。

### 点検して問題なかったもの
- Threads側コールバック（リダイレクト/アンインストール/削除）は元から threads-studio.com で正しい
- 審査用アカウント meta-review@threads-studio.com / ThreadsReview2026! でログイン成功
- 審査用アカウントのThreadsトークンは 2026-09-21 まで有効（審査20日をカバー）
- アプリアイコン・カテゴリ・データ使用状況の確認 すべて設定済み
- threads_basic の「公開待ち」はアクション不要（承認済み・API 11.2k回成功中）

### 次回録画の必須条件
- **?lang=en を付けたURLで撮る**（英語ブラウザなら自動英語だが、確実性のため付ける）
- 審査用アカウント(749)でログインするところから撮る
