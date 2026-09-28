# threads_manage_replies 再審査（7回目提出）準備 — 2026-09-02作成

## 前提（これまでの経緯）

- 6回目提出（2026-08-20 / submission 1404421808262189）の判定が 2026-08-30 に出た。
  **content_publish / manage_insights は承認**、basic / read_replies は更新。
  **threads_manage_replies のみ非承認**。
- 承認済み4権限でアプリはLive稼働中。一般ユーザーの連携に manage_replies を
  混ぜると連携自体が失敗するため、既定スコープから除外している
  （承認後は `THREADS_MANAGE_REPLIES_APPROVED=true` で即復帰・コード対応済み）。
- 過去の却下の真因は毎回「動画とユースケースの不整合」。
  4回目=UIが日本語 → 英語UI化済み。5回目=権限同意画面が映っていない → 録画手順確立済み。

## 今回の勝ち筋：ユースケースを「顧客獲得の中核」として提示し直す

前回の申請文は「Comment Managerで返信できる」だけだった。判定側から見ると
“あれば便利”の域を出ない。**2026-09-02時点で manage_replies は4機能の前提**に
なっており、これを全部見せる。

1. **固定投稿のコメント欄にLINEリンクを自動添付**（今回の新機能・最重要）
   - 本文にURLを貼ると到達が落ちるThreadsの仕様に沿い、集客導線のリンクは
     自分の固定投稿への1件目の返信として置く。返信作成＝manage_replies が必須。
2. **連続投稿（ツリー）の2件目以降**（reply_to_id での返信作成）
   - 権限が無い現在、一般ユーザーはツリーを使えない（1投稿のみ）。
3. **コメント管理からの返信送信**（従来の申請内容）
4. **追い投稿（自分の投稿への再浮上の一言）**

英語ユースケース文（提出フォーム貼り付け用・下書き）:

```
Threads Studio helps local store owners (clinics, salons) in Japan attract
customers on Threads. threads_manage_replies is required for four core
features, all of which create a reply with reply_to_id under the user's
OWN posts:

1. Pinned-post link comment (core acquisition flow): Threads reach drops
   when a raw URL is placed in the post body, so right after the user
   publishes their profile "pinned post", the app automatically publishes
   ONE reply under it containing the store's official LINE registration
   link. The post body says "see the link in the comments". Without
   manage_replies this acquisition flow cannot work.
2. Threaded posts: posts longer than 500 characters are published as a
   chain — the 2nd and later segments are replies to the first.
3. Comment Manager: the owner reads replies from customers (read_replies,
   already approved) and sends an answer from one place.
4. Re-surface note: the user can schedule a short follow-up reply to
   their own post to bring it back into feeds.

All replies are published only on the authenticated user's own account,
either as replies to their own posts or answers to comments on their own
posts. Nothing is posted to other users' content.
```

（英文は日本語混入なしを確認済み。提出前にもう一度通しで読み直すこと）

## 録画（スクリーンキャスト）計画

過去の教訓（docs/meta-review-notes-2026-07.md の6回目の記録）をそのまま踏襲。

**必須3要素**（フレーム画像で秒数確認してから提出）:
1. Threadsのログイン画面（ID/パスワード入力）
2. 権限一覧＋「許可」の同意画面（manage_replies を含む5権限が見えること）
3. 権限を実際に使う操作

**録画前の準備**（三上様の作業が必要な箇所）:
- 録画用アカウント @shittoru_official をThreads設定→「ウェブサイトのアクセス許可」から
  認可削除し、Threadsからログアウトしておく（同意画面とログイン画面を出すため）
- 録画時だけ `THREADS_MANAGE_REPLIES_APPROVED=true` を一時セットした環境で
  連携する（未承認スコープはテスター登録済みアカウントなら通る。
  @shittoru_official はテスター登録済み・過去の録画で実績あり）
- ブラウザ言語は英語 or `?lang=en`

**撮る順序（今回の追加分を太字）**:
```
1. ログイン → 同意画面（5権限）→ 許可 → 接続完了
2. 固定投稿ウィザードで生成 → 公開
3. **公開直後、Threads実画面で「固定投稿の下にLINEリンクのコメントが
   自動で付いている」ことを見せる**（今回の目玉。字幕:
   "The app publishes ONE reply under the user's own pinned post with the
   store's LINE link — this requires threads_manage_replies"）
4. ツリー投稿（2件目以降が返信として連なる様子）
5. 別アカウントからのコメントに Comment Manager から返信
6. （インサイトは承認済みなので撮らなくてよい）
```

## 提出時のノート（審査担当者への説明）冒頭に書くこと

- 前回(1404421808262189)からの差分：manage_replies の用途が
  「コメント返信」だけでなく「固定投稿へのリンクコメント（獲得導線の中核）」
  「ツリー投稿」に広がったこと、それぞれの秒数
- すべて自分の投稿への返信であること（他人のコンテンツには投稿しない）

## 私（Claude）側で完了済みのこと

- 本ドキュメント・英語ユースケース下書き
- アプリ側は録画に必要な機能がすべて本番稼働済み
  （固定投稿のコメント自動添付・ツリー・Comment Manager）

## 三上様にお願いする残作業

1. 録画（上記手順。@shittoru_official の認可削除→ログアウトから）
2. フレーム確認（`ffmpeg -i 動画 -vf fps=1 frames/f%04d.png` で3要素の秒数を確認）
3. Meta App Review コンソールから提出（ユースケース文は上記をコピー）


## 2026-09-03 深夜: 提出作業の到達点（Claudeがブラウザ操作で実施）

- 提出下書きを作成済み: **submission_id=1415761323794904**（threads_manage_replies 新規＋承認済み4権限の更新）
- 8/30の却下理由の原文を確認: 「スクリーンキャストが申請ノートに記載のユースケースの
  エンドツーエンド体験を実証していない」（開発者ポリシー1条6項）。
  → 対策: 申請文を「動画が実際に映している内容」に秒数付きで完全整合させた（下記・最終版）。
- **動画のアップロードだけ未完**。拡張機能経由のファイル設定はMetaのフォームが受け付けず
  （5方式試行: input直接設定×3 / COOP切断でopener経由不可 / PNAでiframe経由不可）、
  ネイティブのファイル選択だけが通る。動画は
  `~/Desktop/審査提出用スクリーンキャスト.mp4`（=8/20提出のseg_final_small.mp4）に配置済み。

### 三上様の残り1操作
1. Chromeで開いているMeta審査タブ（許可された用途 → threads_manage_replies → 開始する）
2. 「ファイルをアップロード」→ デスクトップの「審査提出用スクリーンキャスト.mp4」を選択
3. そのままClaudeに「選んだ」と言う → 申請文の再入力・同意チェック・データの取り扱い・
   審査担当者の指示・最終送信までClaudeが引き継ぐ

### 申請文（最終版・textareaへ貼るもの）
（この下の英文をそのまま。リロードすると旧文に戻るので、動画添付後に貼り直すこと）


## 2026-09-28：8/30 不承認の本当の原因と、撮り直しの手順（9/28 版・これが最新）

### 原因（前回動画 seg_final_small.mp4 をフレームで確認）
- 9:00〜11:10 の字幕「Three reply drafts are proposed」「The reply is published to Threads」の**下に映っているのは投稿分析（Post Analytics）の画面**だった。字幕と映像が約1分ずれている。
- 返信の文案ダイアログは 9:00 前後に「threads_read_replies」の字幕の下で一瞬出るだけで、**返信を公開する操作と、Threads 上に返信が載った画面はどこにも映っていない**。
- 公開（content_publish）と分析（manage_insights）は映っていたので承認され、返信だけが「エンドツーエンドが実証されていない」で落ちた、で説明がつく。
- 9/3 に準備した「8/20 の動画をそのまま再提出」は、同じ理由でまた落ちるので**使わない**。

### アプリ側（e467ec0・9/28 夜に反映）
- 承認前でも user 78（三上様）の連携だけ threads_manage_replies を求める。同意画面に5権限が出る。@shittoru_official はテスター登録ずみ。

### 三上様にお願いすること（録画の前）
1. 別のアカウント（例：@moveact_seitai）から、@shittoru_official の投稿にコメントを1件付ける
2. @shittoru_official で Threads → 設定 → ウェブサイトのアクセス許可 → Threads Studio を削除 → Threads からログアウト
   （@shittoru_official は録画の中で連携し直すまで自動投稿が止まる。予定の無い時間に行う）
3. 録画中、Threads のログイン画面で ID とパスワードを入力する（AI は入力しない）

### 撮る順序（返信だけに絞った5分程度・字幕は撮った後に実時刻で付ける）
1. https://threads-studio.com/dashboard?lang=en → Connect Threads
2. Threads ログイン画面 → 同意画面（threads_manage_replies を含む5権限）→ 許可 → 連携完了
3. Comment Manager → コメントを選ぶ → Generate AI reply → 1つ選ぶ → Publish → 「Replied」
4. **threads.com でその投稿を開き、コメントの下に返信が載っていることを映す**（前回欠けていたもの）
5. 長文（500字超）を予約・公開 → threads.com で2件目以降が返信として連なっていることを映す
- 字幕は必ず録画後にフレームを見て秒数を決め、焼き込み後にもう一度フレームで照合する。
- 申請文には、動画に映したもの（コメントへの返信・ツリー投稿）だけを書く。映していない機能（固定投稿のリンクコメント・追い投稿）は書かない。


## 2026-09-28 夜：同じ録画に「場所のタグ」「Instagramストーリーズ同時シェア」を足す（三上様「Meta のアプリレビューの審査も通してください」）

リーチを広げる機能（shared/threadsFeatures.ts）のうち、この2つだけは Meta の審査が要る。返信の撮り直しと**同じ録画・同じ申請**に入れる（録画は三上様のログインが要るので1回にまとめる）。

### アプリ側（コミット済み・今夜反映）
- 録画用ユーザー（`THREADS_REVIEW_REPLY_SCOPE_USER_IDS=78`・Coolify 設定済み）の連携だけ、`threads_location_tagging`・`threads_share_to_instagram` も求める → 同意画面に**7権限**が出る
- 連携後、Connect Threads のアカウント欄に **Reach settings**（英語表示）が出る
  - Location tag：検索 → 「Use this location」→ 以後の投稿に location_id が付く
  - Also share to Instagram Stories：On にすると以後の投稿に crossreshare_to_ig=true が付く
- 付けられなかったときは外して投稿だけ出す（投稿が止まらない）
- 承認後：`THREADS_LOCATION_TAGGING_APPROVED=true`・`THREADS_SHARE_TO_IG_APPROVED=true` で全員に広がる

### 録画前に必要なこと（三上様）
- **@shittoru_official にInstagramアカウントがつながっていること**（Threadsのプロフィール→Instagramとリンク）。つながっていないと同時シェアは失敗する（投稿は出る）
- ⚠️**場所の検索は、承認前は「Menlo Park」しか返らない**（Meta の資料の仕様）。録画では「Menlo Park」で検索して選ぶ。録画のあとは場所を「外す」を押して戻す（しっとる公式の普段の投稿にMenlo Parkが付かないように）

### 撮る順序（返信の5つの後ろに足す・合計7〜8分）
6. Connect Threads → Reach settings → Location tag で「Menlo Park」を検索 → Use this location
7. 同じ欄で Also share to Instagram Stories を On
8. 投稿を1本すぐ公開（Posts → Post now）
9. **threads.com でその投稿に場所（Menlo Park）が表示されていることを映す**
10. **Instagram アプリ（またはinstagram.com）でストーリーズに同じ投稿が出ていることを映す**
11. Reach settings で場所を外し、同時シェアを Off に戻す（録画の外でもよい）

### 申請文（英語・下書き。録画の秒数を入れてから貼る）

threads_location_tagging:
```
Threads Studio helps local store owners (clinics, salons, gyms) in Japan reach nearby customers on Threads.
With threads_location_tagging, the owner searches for their own store location once (Connect Threads > Reach settings > Location tag),
selects it, and the app adds that location_id to the posts it publishes on the owner's own account.
This lets people nearby discover the store's posts. The screencast shows: searching the location (mm:ss), selecting it (mm:ss),
publishing a post (mm:ss), and the published post on threads.com showing the location tag (mm:ss).
The location is only added to the authenticated user's own posts, and the user can remove it at any time.
```

threads_share_to_instagram:
```
Many of our users run their store's Instagram account together with Threads. With threads_share_to_instagram, the owner turns on
"Also share to Instagram Stories" for their account (Connect Threads > Reach settings), and the app sets crossreshare_to_ig=true
when it publishes the owner's post, so the same post also appears as a Story on the owner's linked Instagram account.
The screencast shows: turning the setting on (mm:ss), publishing a post (mm:ss), and the Story on the linked Instagram account (mm:ss).
It only shares the authenticated user's own posts to their own linked Instagram account, and can be turned off at any time.
```
