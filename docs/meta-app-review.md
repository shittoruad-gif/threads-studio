# Threads Studio — Meta App Review 提出キット

App: **Threads Studio** / App ID `1250891946948510`
URL: https://threads-studio.com
申請: Threads API ユースケースの **Advanced Access**（テスター以外も連携できるようにする）

> 📝 2026-06-15 訂正：いったん `threads_manage_replies` を除外したが、**復活させた**。
> 連続投稿（ツリー）の2件目以降とコメント返信は `reply_to_id` で作成するが、本番で
> 「Application does not have permission for this action（code:10）」となり失敗した。
> エンドポイントが content_publish と同じでも、**返信を作成するアクション自体に
> `threads_manage_replies` 権限が必要**と判明したため。
> **申請する権限は basic / content_publish / manage_replies / read_replies / manage_insights の5つ。**

> ⚠️ セキュリティ注意：以前このファイルにレビュー用アカウントのパスワードを直書きし、
> Git（GitHub）にpushされました。**そのパスワードは必ず変更（ローテーション）してください。**
> 以後、パスワード等の秘密情報はこのファイルに書かず、Metaの申請フォームに直接入力してください。

前回の不合格理由：スクリーンキャストがユースケースに整合していない（連携→投稿までの一連が実演されていない）。
→ 今回は「ログイン→連携（許可画面）→生成→投稿→Threadsに表示」を **1本の動画でつなげて** 撮る。

---

## 申請する権限（アプリの実装と一致）

| 権限 | 用途（アプリ内のどこで使うか） |
|---|---|
| `threads_basic` | 連携ユーザーのプロフィール（ユーザー名・画像）取得。投稿先アカウントの表示・連携確認に使用。 |
| `threads_content_publish` | 中核機能。AIで作成した投稿を本人のThreadsへ公開（今すぐ／予約／自動投稿）。 |
| `threads_manage_replies` | 連続投稿（ツリー）の2件目以降（`reply_to_id`）と「コメント管理」での返信に必須。返信の作成アクションがこの権限を要求する。 |
| `threads_read_replies` | 「コメント管理」画面で、本人の投稿のコメントを取得・表示。 |
| `threads_manage_insights` | 「投稿分析」画面で、本人の投稿の閲覧数・いいね・返信・リポストを表示。 |

※ OAuth要求スコープ（`server/threadsAuth.ts`）と一致しています（5権限）。

---

## ① 撮影台本（スクリーンキャスト）

- 画面録画（スマホ or PCのブラウザ）。**音声ナレーション不要**、操作が見えればOK。
- 長さの目安 **2〜3分**。各操作をゆっくり、画面全体を映す。
- 申請する権限を全部実演する。

| # | 映すもの | 操作・ポイント |
|---|---|---|
| 1 | Threads Studio のログイン画面 | テスト用アカウントでログイン |
| 2 | サイドバー「Threads連携」 | クリックして連携ページを開く |
| 3 | 「Threadsと連携」ボタンを押す | ここから審査官の核心 |
| 4 | **Metaの許可（認可）画面** | 要求権限が表示される →「許可」を押す。**この画面を数秒しっかり映す** |
| 5 | 連携完了（@ユーザー名が表示） | アカウントが連携された状態を見せる（basic） |
| 6 | 「AI投稿生成」→ プロジェクトを選択 | 既存プロジェクトでOK |
| 7 | 目的を選ぶ →「AI投稿を生成」 | 生成された下書きが出るまで映す |
| 8 | 「今すぐThreadsに投稿」→ 確認 → 投稿 | **content_publish の実演** |
| 9 | **実際のThreadsでその投稿が出ている** | 公開された証拠を映す（最重要） |
| 10 | 「投稿分析」画面 | 自分の投稿の閲覧数・いいね等を表示（**insights**） |
| 11 | 「コメント管理」画面 | 自分の投稿のコメント閲覧を実演（**read_replies**）※返信はcontent_publishで動作 |

撮影のコツ：
- 4番の許可画面と9番の「Threadsに実際に出た」場面は **必ず** 入れる（前回欠けていた部分）。
- 早送り・カット編集は最小限に。連続して操作しているのが分かるように。

---

## ② App Review に貼り付ける英語テスト手順（How to test / Notes for reviewer）

> ※ テストログインは審査官用に **専用アカウントを1つ作成** し、申請フォームに直接記入してください
>   （このファイルにパスワードを書かないこと）。連携時の Threads 認可は審査官自身の Threads で行えます。

```
App: Threads Studio (https://threads-studio.com)
Purpose: A tool for small local businesses (clinics, salons) in Japan to create
Japanese marketing posts with AI and publish/schedule/analyze them on THEIR OWN
Threads account.

Test login (email/password):
  Email: <reviewer test email>
  Password: <set in this form only>
  (This account already has a sample project and an active plan, so you can
   generate and publish right away after connecting a Threads account.)

Step-by-step:
1. Log in with the test account above.
2. In the left sidebar, open "Threads連携" (Threads Connect).
3. Click "Threadsと連携" (Connect with Threads).
4. On Meta's authorization screen, approve the requested permissions.
5. The connected account (@username) is shown — connection complete. (threads_basic)
6. Open "AI投稿生成" (AI Post Generation) and select a project.
7. Choose a post goal and click "AI投稿を生成" (Generate). A draft appears.
8. Click "今すぐThreadsに投稿" (Post now), then confirm. (threads_content_publish)
9. The post is published to the connected Threads account (visible on Threads).
10. Open "投稿分析" (Post Analytics) to see views/likes/replies of your posts. (threads_manage_insights)
11. Open "コメント管理" (Comment Manager) to read comments on your posts. (threads_read_replies)
    (Replying to comments is implemented via threads_content_publish with reply_to_id.)

Permission justification:
- threads_basic: Read the connected user's profile (username, avatar) to show which
  account posts will be published to and confirm the connection.
- threads_content_publish: Core feature — publish the user's AI-generated posts to
  their own Threads account (immediately, scheduled, or automatically). Also used to
  reply to comments and create connected reply threads (via reply_to_id).
- threads_read_replies: Read comments on the user's own posts to display them in the
  comment-management screen.
- threads_manage_insights: Show the user the performance (views, likes, replies,
  reposts) of their own published posts in the analytics screen.

Data deletion & deauthorize callbacks are implemented and verify the Meta
signed_request signature (HMAC-SHA256) before processing.

A screencast demonstrating the full flow (login → connect/authorize → generate →
publish → post visible on Threads → analytics → comments) is attached.
```

---

## ③ アプリ設定（Meta開発者コンソール）に登録する値

| 項目 | 値 |
|---|---|
| OAuth Redirect URI | `https://threads-studio.com/threads-connect` |
| Deauthorize Callback URL | `https://threads-studio.com/api/threads/deauthorize` |
| Data Deletion Request URL | `https://threads-studio.com/api/threads/data-deletion` |
| プライバシーポリシーURL | `https://threads-studio.com/privacy` |
| 利用規約URL | `https://threads-studio.com/terms` |

---

## 技術的な準備（実装側）— 確認済み

- [x] プライバシー / 利用規約 / 特商法ページが公開（HTTP 200）
- [x] データ削除コールバック：`signed_request` をHMAC-SHA256で**署名検証**し、本人の連携データを物理削除
- [x] deauthorizeコールバック：署名検証のうえ連携停止・アクセストークン消去
- [x] アクセストークンは暗号化保存／60日トークンは自動更新
- [x] OAuthスコープ＝申請権限と一致（basic / content_publish / read_replies / manage_insights）

## 提出前チェックリスト（オーナー作業）
- [ ] **ビジネス認証**が完了している
- [ ] レビュー用ログインアカウントを新規作成し、②に直接記入（旧パスワードは破棄・変更）
- [ ] 動画に「許可画面」と「Threadsに実際に投稿された画面」が入っている
- [ ] 申請する各権限が動画で実演されている
- [ ] ③のコールバック/URLが開発者コンソールに登録済み
- [ ] ②のテスト手順を「How to test」欄に貼った
- [ ] 審査通過後、レビュー用アカウントを削除し、関連パスワードを無効化
