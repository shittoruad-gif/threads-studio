# Threads Studio — Meta App Review 提出キット

App: **Threads Studio** / App ID `1250891946948510`
URL: https://threads-studio.com
申請: Threads API ユースケースの **Advanced Access**（テスター以外も連携できるようにする）

前回の不合格理由：スクリーンキャストがユースケースに整合していない（連携→投稿までの一連が実演されていない）。
→ 今回は「ログイン→連携（許可画面）→生成→投稿→Threadsに表示」を **1本の動画でつなげて** 撮る。

---

## ① 撮影台本（スクリーンキャスト）

- 画面録画（スマホ or PCのブラウザ）。**音声ナレーション不要**、操作が見えればOK。
- 長さの目安 **2〜3分**。各操作をゆっくり、画面全体を映す。
- 申請する権限を全部実演する（basic / content_publish は必須。insights / replies を申請するならその画面も）。

| # | 映すもの | 操作・ポイント |
|---|---|---|
| 1 | Threads Studio のログイン画面 | テスト用アカウントでログイン（メール＋パスワード） |
| 2 | サイドバー「Threads連携」 | クリックして連携ページを開く |
| 3 | 「Threadsと連携」ボタンを押す | **ここから審査官の核心** |
| 4 | **Metaの許可（認可）画面** | 要求権限が表示される → **「許可」を押す**。この画面をしっかり数秒映す |
| 5 | 連携完了（@ユーザー名が表示） | アカウントが連携された状態を見せる |
| 6 | サイドバー「AI投稿生成」→ プロジェクトを選択 | 既存プロジェクトでOK |
| 7 | 「投稿の目的」を1つ選ぶ → 「AI投稿を生成」 | 生成された下書きが出るまで映す |
| 8 | 「今すぐThreadsに投稿」→ 確認 → 投稿する | **content_publish の実演** |
| 9 | **実際のThreadsアプリ/サイトでその投稿が出ている** | 投稿が公開された証拠を映す（最重要） |
| 10 | （insights申請時）「投稿分析」画面 | 自分の投稿の閲覧数・いいね等を表示 |
| 11 | （replies申請時）「コメント管理」画面 | 自分の投稿へのコメント閲覧・返信を実演 |

撮影のコツ：
- 4番の許可画面と9番の「Threadsに実際に出た」場面は **必ず** 入れる（前回欠けていた部分）。
- 早送り・カット編集は最小限に。連続して操作しているのが分かるように。

---

## ② レビュアー用メモ（日本語・自分用の確認）

- アプリは、店舗オーナー（治療院・サロン等）が **自分のThreadsアカウント** を連携し、AIで作った集客投稿を **自分のThreads** に投稿・予約・分析するツール。
- 各権限の用途：
  - `threads_basic`：連携したユーザーのプロフィール（ユーザー名・画像）を取得し、「どのアカウントに投稿するか」を表示するため。
  - `threads_content_publish`：本機能。ユーザーが作った投稿を本人のThreadsへ公開（即時・予約）するため。
  - `threads_manage_insights`：本人の投稿の成果（閲覧数・いいね・返信数）を分析画面で表示するため。
  - `threads_manage_replies`：本人の投稿へのコメントをアプリ内で閲覧・返信するため。

---

## ③ App Review に貼り付ける英語テスト手順（How to test / Notes for reviewer）

> ※ 下のテストログインは、審査官用に **専用アカウントを1つ作って** 記入してください。
> 連携時の Threads 認可は、審査官自身の Threads アカウントで行えます。

```
App: Threads Studio (https://threads-studio.com)
Purpose: A tool for small local businesses (clinics, salons) in Japan to create
Japanese marketing posts with AI and publish/schedule/analyze them on THEIR OWN
Threads account.

Test login (email/password):
  Email: meta-review@threads-studio.com
  Password: MetaReview2026!
  (This account already has a sample project and an active plan, so you can
   generate and publish right away after connecting a Threads account.)

Step-by-step:
1. Log in with the test account above.
2. In the left sidebar, open "Threads連携" (Threads Connect).
3. Click "Threadsと連携" (Connect with Threads).
4. On Meta's authorization screen, approve the requested permissions.
5. The connected account (@username) is shown — connection complete.
6. Open "AI投稿生成" (AI Post Generation) in the sidebar and select a project.
7. Choose a post goal and click "AI投稿を生成" (Generate). A draft appears.
8. Click "今すぐThreadsに投稿" (Post to Threads now), then confirm.
9. The post is published to the connected Threads account (visible on Threads).

Permission justification:
- threads_basic: Read the connected user's profile (username, avatar) to show
  which account posts will be published to and confirm the connection.
- threads_content_publish: Core feature — publish the user's AI-generated posts
  to their own Threads account (immediately or on schedule).
- threads_manage_insights: Show the user the performance (views, likes, replies)
  of their own published posts in the analytics screen.
- threads_manage_replies: Let the user view and reply to comments on their own
  Threads posts from the comment-management screen.

A screencast demonstrating the full flow (login → connect/authorize → generate →
publish → post visible on Threads) is attached.
```

---

## 提出前チェックリスト
- [ ] ビジネス認証が完了している
- [ ] テスト用ログインアカウントを作成し、③に記入した
- [ ] 動画に「許可画面」と「Threadsに実際に投稿された画面」が入っている
- [ ] 申請する各権限が動画で実演されている
- [ ] ③のテスト手順を「How to test」欄に貼った
