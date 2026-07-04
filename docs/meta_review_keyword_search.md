# Meta審査申請：threads_keyword_search（Advanced Access）

対象アプリ：Threads Studio（threads-studio.com）
申請権限：`threads_keyword_search`
準備日：2026-07-04

---

## 提出用ユースケース説明（英語・そのまま貼り付け用）

**How will your app use this permission?**

Threads Studio is a SaaS for small local businesses in Japan (chiropractic
clinics, osteopathic clinics, beauty salons). Most of our users are new to
Threads and are not familiar with social media marketing.

We use `threads_keyword_search` for exactly one feature: the "Regional
Trends" panel inside our post-composer. When a logged-in user taps
"Collect popular posts in my area", the app performs keyword searches
(search_type=TOP) using the user's own registered locality names (e.g.
their city, town, and nearest station names, which are derived from
official map data). The returned public posts are shown to that user only,
inside their own dashboard, as *inspiration references*: the user can pick
up to three posts, and our AI then drafts an ORIGINAL post on a similar
topic using only the user's own business facts. We explicitly instruct the
model to never copy wording and never reuse other accounts' facts, and the
user always reviews and approves any post before it is published to their
own Threads account.

We do not scrape, we do not store search results beyond the user's own
reference list (user-deletable), we do not display results publicly, we do
not use results for advertising or training, and we make at most a handful
of keyword_search calls per explicit user tap (no background crawling).

**Steps to test:**
1. Log in at https://threads-studio.com with the provided test account.
2. Connect a Threads account (OAuth).
3. Open「AI投稿生成」(post composer) → expand the「📍 地域トレンド」panel.
4. Tap「この地域の人気投稿を集める」→ the app calls keyword_search with the
   user's registered area keywords and lists the returned public posts.
5. Select up to 3 posts →「AI投稿を生成」→ an original draft is generated;
   the user edits/approves before anything is published.

---

## 日本語版（自社控え・画面録画のナレーション用）

Threads Studio は日本の小規模店舗（整骨院・整体院・美容サロン）向けのSaaSです。
`threads_keyword_search` は「地域トレンド」機能のみに使用します。

- ユーザーが自分で「この地域の人気投稿を集める」を押したときだけ、
  ユーザー自身の登録地域（市区町村名・最寄り駅名。地図データ由来）で
  keyword_search（search_type=TOP）を実行します。
- 結果は本人のダッシュボード内にのみ表示。参考として最大3件選ぶと、
  AIが「同じ話題を、その店舗自身の事実だけで書いたオリジナル投稿」を下書きします。
  文章のコピー・他店の実績流用は禁止をプロンプトで強制しています。
- 投稿は必ず本人が確認・承認してから、本人のアカウントにのみ公開されます。
- バックグラウンド収集はせず、ボタン押下時のみ数回のAPI呼び出し。
  結果の一般公開・広告利用・学習利用はしません。保存分は本人がいつでも削除できます。

## 提出手順（Meta App Dashboard）

1. https://developers.facebook.com/apps → Threads Studio のアプリを選択
2. 左メニュー「アプリの審査（App Review）」→「権限と機能（Permissions and Features）」
3. `threads_keyword_search` の行で「Advanced Accessをリクエスト」
4. 上の英語ユースケースを貼り付け、テスト手順を記入
5. スクリーン録画（上記Steps 1-5 の操作を1本の動画に）を添付
   - 録画はマカセル審査と同様、QuickTimeで画面収録 → mp4
6. テストユーザーの認証情報を「App Review用メモ」に記載
7. 送信 → 審査は通常数営業日〜2週間

## 備考

- 承認までの間も、アプリ側は「手動追加」で同機能が使える（権限エラー時は
  ユーザーに分かりやすいメッセージを表示済み）。
- 承認後は追加デプロイ不要（スコープは実装済み。再連携したユーザーから有効）。
- 既存連携ユーザーは、承認後に一度「Threads連携」をやり直すと新権限が付く。
