# BYOA（自分のMetaアプリで連携）と 代理店プラン（クライアントID発行）

2026-08-06 実装・本番反映済み。

## 1. BYOA — Meta審査に依存しない保険

弊社アプリの審査が通らなくても、**利用者が自分で作ったMetaアプリなら
自分のThreadsアカウントに対して審査なしで全権限が使える**という仕様を利用する。

### 実装
- `users.threadsAppId` / `users.threadsAppSecretEnc`（Secretは encryption.ts で暗号化）
- `server/threadsAuth.ts` の以下3つが per-user 資格情報を受け取れる
  （第3引数 `creds`。未指定なら従来どおり `ENV.threadsAppId/Secret` にフォールバック）
  - `getThreadsAuthUrl(config, options, creds?)`
  - `exchangeCodeForToken(code, redirectUri, creds?)`
  - `exchangeForLongLivedToken(token, creds?)`
- 呼び出し側（routers.ts の `threads.getAuthUrl` / `threads.handleCallback`）で
  `db.getUserThreadsAppCreds(userId)` を渡す。
  **認証URL生成と토ークン交換で同じ資格情報を使うこと**（食い違うと invalid_client）。
- **投稿・トークン更新は access_token のみで動くため変更不要**（確認済み）。
  `refreshAccessToken` は `th_refresh_token` + access_token だけで client_secret 不要。

### 画面
設定 → 「自分のMetaアプリで連携する（上級者向け）」
- クライアントがMeta側に登録すべき3つのURL（リダイレクト/アンインストール/データ削除）を
  コピーボタン付きで表示
- Secretは保存後は二度と表示しない

### API
- `threads.getOwnApp` … 設定状況と登録すべきURL
- `threads.setOwnApp` / `threads.clearOwnApp`

## 2. 代理店プラン — クライアントへ個別ID発行

代理店（¥55,000/月）が契約すると、クライアントごとにログインIDを発行できる。
発行したIDは代理店契約に内包されるため**クライアント側の決済は発生しない**。

### 実装
- `users.parentAgencyUserId` で代理店↔クライアントを親子管理（indexあり）
- `agency_client` プラン（`shared/plans.ts`、priceMonthly: 0）
  - 料金ページからは除外（Pricing.tsx でフィルタ）
  - 機能: プロジェクト3・Threads1・自動投稿3回/日・AI生成無制限
- 上限 `AGENCY_CLIENT_LIMIT = 30`
- `agency` ルーター（すべて代理店プラン契約＋自分の配下かを検証）
  - `listClients` / `createClient` / `setClientActive` / `resetClientPassword`
- 代理店が解約されると配下クライアントを連鎖停止（Univapay Webhook の isCanceled 分岐）

### 画面
サイドバー「代理店 > クライアント管理」（代理店プラン契約者にだけ表示）
- 発行直後だけログイン情報（URL/メール/パスワード）を表示・コピー可能
  ※パスワードはハッシュ保存なので後から確認できない
- パスワード自動生成（紛らわしい文字を除いた12桁）
- 停止/再開・パスワード再設定

## 3. 実装中に見つけて直した不具合（重要）

**名前が空のユーザーはログイン直後に必ず401になっていた。**

- `sdk.createSessionToken` は `name` 未指定だと空文字でJWTを発行する
- 一方 `sdk.verifySession` は `openId` / `appId` / `name` すべての非空を必須にしている
- 結果、ログインAPIは200を返すのに以後の全リクエストが `Please login (10001)` になる

修正:
- `createSessionToken`: name が空なら openId をフォールバックに使う（根本対処）
- `createAgencyClient`: 名前未入力なら 店舗名 → メールのローカル部 で必ず埋める

代理店が発行したクライアントIDで実際に踏んだ。既存の「名前未設定ユーザー」全般に
効く修正なので、同種の問い合わせがあればこれを疑う。

## 4. 本番での検証結果（2026-08-06）

- 非代理店が `agency.*` を叩く → 「代理店プランのご契約が必要です。」で拒否 ✅
- 代理店がクライアント発行 → 成功（userId採番・agency_client付与） ✅
- 発行したIDでログイン → 成功、プラン `agency_client` / active ✅
- 停止 → クライアント側 status=canceled、再開 → active ✅
- 画面: 非代理店には案内、代理店には管理UI ✅
- テストデータ（クライアント1件）とプラン変更は検証後に完全復旧済み
