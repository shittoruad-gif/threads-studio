# Threads API仕様調査結果

## 基本情報

**APIエンドポイント:**
- `graph.threads.com` または `graph.threads.net`

**必要な権限（Permissions）:**
- `threads_basic` - 基本的なプロフィール情報へのアクセス
- `threads_content_publish` - 投稿の作成・公開
- `threads_manage_replies` - リプライの管理
- `threads_delete` - 投稿の削除
- `threads_location_tagging` - 位置情報タグ付け

## レート制限

### 投稿（Posts）
- **制限:** 24時間で250投稿まで
- **カルーセル:** 1投稿としてカウント
- **エンドポイント:** `POST /{threads-user-id}/threads_publish`
- **確認API:** `GET /{threads-user-id}/threads_publishing_limit`

### リプライ（Replies）
- **制限:** 24時間で1,000リプライまで

### 削除（Deletion）
- **制限:** 24時間で100削除まで

### 位置情報検索（Location Search）
- **制限:** 24時間で500検索まで

### 全体のAPI呼び出し制限
```
Calls within 24 hours = 4800 * Number of Impressions
```
- Impressionsの最小値: 10

## 投稿仕様

### テキスト投稿
- **文字数制限:** 500文字まで

### 画像投稿
- **フォーマット:** JPEG, PNG
- **ファイルサイズ:** 最大8MB
- **アスペクト比:** 最大10:1
- **最小幅:** 320px（必要に応じて拡大）
- **最大幅:** 1440px（必要に応じて縮小）
- **カラースペース:** sRGB

### 動画投稿
- **コンテナ:** MOV または MP4
- **音声コーデック:** AAC, 48khz, モノラルまたはステレオ
- **動画コーデック:** HEVC または H264
- **フレームレート:** 23-60 FPS
- **最大解像度:** 1920px（横）
- **アスペクト比:** 0.01:1 〜 10:1（推奨9:16）
- **ビットレート:** 最大100 Mbps
- **再生時間:** 最大5分（300秒）
- **ファイルサイズ:** 最大1GB

### カルーセル投稿
- **最小:** 2枚
- **最大:** 20枚

## OAuth認証フロー

1. **Meta App作成**
   - Meta for Developersでアプリを作成
   - Threads Use Caseを選択

2. **OAuth URL生成**
   ```
   https://threads.net/oauth/authorize?
     client_id={app-id}&
     redirect_uri={redirect-uri}&
     scope=threads_basic,threads_content_publish&
     response_type=code
   ```

3. **アクセストークン取得**
   - Authorization codeを取得
   - Short-lived tokenに交換
   - Long-lived tokenに交換（60日間有効）

4. **トークン更新**
   - Long-lived tokenは60日間有効
   - 有効期限前に更新が必要

## 投稿API

### 2ステッププロセス

#### Step 1: メディアコンテナ作成
```
POST /{threads-user-id}/threads
```
パラメータ:
- `media_type`: TEXT, IMAGE, VIDEO, CAROUSEL
- `text`: 投稿テキスト（最大500文字）
- `image_url`: 画像URL（IMAGE時）
- `video_url`: 動画URL（VIDEO時）
- `children`: カルーセルの子要素ID配列（CAROUSEL時）

#### Step 2: メディアコンテナ公開
```
POST /{threads-user-id}/threads_publish
```
パラメータ:
- `creation_id`: Step 1で取得したコンテナID

## 実装の注意点

1. **メディアアップロード**
   - 画像・動画は事前に公開URLでアクセス可能にする必要がある
   - S3などのストレージサービスを使用

2. **レート制限管理**
   - 投稿前に`threads_publishing_limit`を確認
   - 予約投稿時は特に注意

3. **エラーハンドリング**
   - トークン有効期限切れ
   - レート制限超過
   - メディアフォーマットエラー

4. **トークン管理**
   - Long-lived tokenの有効期限を追跡
   - 自動更新機能の実装

## 次のステップ

1. Meta App IDとApp Secretの取得
2. OAuth認証フローの実装
3. トークン管理機能の実装
4. 投稿API統合
5. 予約投稿機能との統合
