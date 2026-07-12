# Meta App Review 再申請ガイド（2026-07-12 却下対応）

## 却下の事実（原文ベース）

2026年7月12日提出分の結果：

| 権限 | 結果 |
|---|---|
| threads_basic | ✅ Approved |
| threads_read_replies | ✅ Approved |
| threads_content_publish | ❌ Not approved |
| threads_manage_replies | ❌ Not approved |
| threads_manage_insights | ❌ Not approved |

**却下された3つはすべて同一理由：**
「スクリーンキャストがユースケースの詳細に整合しない」（開発者ポリシー第1条6項 – 品質の高い製品の開発）

Metaの原文（要点）：
> **アプリのユースケースが許可されると判断しました**が、提出されたスクリーンキャストでは、
> 申請ノートに記載されているユースケースのエンドツーエンド体験が実証されていないため、
> リクエストされたアクセス許可/機能が却下されました。

### これが意味すること
- **アプリの機能・設計は問題視されていない。** ユースケース自体は「承認可能」と判断済み。
- 却下の唯一の原因は **審査用の画面録画（スクリーンキャスト）** が、
  ログイン〜権限付与〜各機能の一連の流れ（エンドツーエンド）を映していなかったこと。
- → **アプリを作り直しても通らない。正しい録画を1本撮り直せば通る。**

Metaが録画に求める5点：
1. 完全なMetaのログインフロー（Threads OAuth連携の一部始終）
2. ユーザーがアプリに権限を付与する画面（Meta側の同意画面）
3. リクエストした各権限のエンドツーエンドの利用
4. 画面録画ベストプラクティス（UIを英語にする、または英語キャプションで各ボタン/画面の意味を説明）
5. サーバー間アプリ or システムユーザートークン利用なら、その旨を明記
   （本アプリは該当しない＝フロントエンドのMetaログイン認証フローを実際に表示する）

---

## 撮り直す録画（1本・連続・目安3〜5分）

**準備**
- 本番 https://threads-studio.com を使用（テスト用アカウントで可）
- 画面録画は英語UI環境が理想だが、**日本語UIのまま英語キャプション（字幕）で各操作を説明**すれば要件4を満たせる
- 実際に投稿できるThreadsアカウントを用意（下書きではなく本当に公開まで見せる）
- 音声ナレーション or 字幕どちらでも可。字幕推奨（英語）

### シーン構成（この順番で連続録画）

**Scene 0 – イントロ（10秒）**
- 字幕: "Threads Studio – helps local stores in Japan create and publish Threads posts. This video shows the full end-to-end flow."

**Scene 1 – ログイン（要件1の前半）**
1. /login を開く
2. メールアドレス＋パスワードでアプリにログイン
- 字幕: "Step 1: The store owner logs into Threads Studio with email and password."

**Scene 2 – Meta(Threads) OAuth連携（要件1・2の核心。ここが前回抜けていた最重要部分）**
1. 左メニュー「Threads連携」→ /threads-connect を開く
2. 「Threadsアカウントを連携」ボタンを押す
3. **Meta/Threadsの認証画面に遷移する様子をそのまま映す**
4. **権限同意画面（threads_content_publish / manage_replies / manage_insights 等が並ぶ画面）を映し、"Allow"（許可）を押す**
5. アプリに戻り「連携しました」表示まで映す
- 字幕: "Step 2: The user connects their Threads account. This is the full Meta login flow. The user grants the app permission to publish posts, manage replies, and read insights. We tap Allow."
- ⚠️ このOAuth画面と同意画面を映すことが最重要。前回はここが映っていなかったため全滅した。

**Scene 3 – threads_content_publish のエンドツーエンド**
1. /ai-generate で投稿文を作成（テンプレ入力→生成）
2. 生成された投稿を「今すぐ投稿」で **実際にThreadsへ公開**
3. 公開成功のトースト／投稿履歴に「公開済み」が出るまで映す
4. （可能なら）実際のThreads上に投稿が表示されている画面も映すと完璧
- 字幕: "Use case for threads_content_publish: The app generates a post and publishes it directly to Threads. Here the post is now live on the user's Threads account."

**Scene 4 – threads_manage_replies のエンドツーエンド**
1. /comment-manager（コメント管理）を開く
2. 公開した投稿に付いたコメント/返信の一覧が読み込まれる様子を映す
3. **アプリ内から返信を入力して送信**し、返信がThreadsに反映されるまで映す
- 字幕: "Use case for threads_manage_replies: The app lists replies on the user's posts and lets the user reply back to their audience from within the app."

**Scene 5 – threads_manage_insights のエンドツーエンド**
1. /post-analytics（投稿分析）を開く
2. 公開済み投稿の表示回数(views)・いいね・返信などのインサイトが表示される様子を映す
- 字幕: "Use case for threads_manage_insights: The app shows the performance (views, likes, replies) of the user's published posts so the store can see what works."

**Scene 6 – アウトロ（5秒）**
- 字幕: "That is the complete end-to-end flow: login, connect Threads, publish, manage replies, and view insights."

### 録画のNG回避チェックリスト
- [ ] Scene 2 の **Meta認証画面＋権限同意画面** が確実に映っている（最重要）
- [ ] 各権限（publish / replies / insights）の **実データでの動作** が映っている（モックやダミー画面ではない）
- [ ] 英語キャプションで各画面の意味を説明している
- [ ] 投稿は本当に公開している（下書きで終わらせない）
- [ ] 途中でエラー画面を出さない（事前に一度通しリハーサル）

---

## 申請ノート（英語・各権限のUse case detailsにそのまま貼る）

### threads_content_publish
```
Threads Studio helps small local businesses in Japan (salons, clinics, restaurants)
create and publish marketing posts to their own Threads account.

End-to-end flow shown in the screencast:
1. The store owner logs into Threads Studio (email/password).
2. They connect their Threads account via the full Meta OAuth login flow and grant permissions (shown on screen, tapping "Allow").
3. In the AI generation screen they create a post and publish it directly to their own Threads account. The screencast shows the post going live.

We only publish to the authenticated user's own account, triggered by an explicit user action. This is not a server-to-server app; the Meta login/authorization flow is shown in the video.
```

### threads_manage_replies
```
After publishing, store owners need to respond to their customers. In the Comment
Manager screen, the app lists the replies on the user's own posts (using
threads_read_replies) and lets the user post a reply back from within the app
(threads_manage_replies).

The screencast shows: connecting Threads (full Meta login + permission grant),
opening the Comment Manager, viewing real replies on the user's post, and sending
a reply that appears on Threads.

Only the authenticated user's own posts/replies are accessed, by explicit user action.
```

### threads_manage_insights
```
Store owners want to know which posts work. The Post Analytics screen shows the
performance (views, likes, replies) of the user's own published posts.

The screencast shows: connecting Threads (full Meta login + permission grant),
publishing a post, then opening Post Analytics to view that post's insights.

Only the authenticated user's own post insights are accessed, by explicit user action.
This is not a server-to-server app; the frontend Meta login flow is shown in the video.
```

### 「App Review 再申請」提出時の補足コメント欄（要件5への回答）
```
This app is NOT a server-to-server app and does NOT use a system user token.
It uses the standard frontend Meta (Threads) OAuth login flow, which is fully
shown in the attached screencast (account connection + permission consent screen
with "Allow").
```

---

## 手順まとめ（オペレーター作業）
1. 上のシーン構成どおりに本番アプリで通しリハーサル（1回）
2. 画面録画（英語字幕、3〜5分）
3. Meta App Review →「もう一度リクエスト」→ 却下された3権限を追加
4. 各権限のUse case detailsに上の英語ノートを貼付、スクリーンキャストをアップロード
5. 補足コメント欄に要件5への回答を記載して提出

> 注意: keyword_search（地域トレンド用）は今回の対象外。まずこの3権限を通してから別途申請する。
