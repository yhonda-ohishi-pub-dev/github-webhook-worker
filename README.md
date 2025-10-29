# GitHub Webhook Worker

Cloudflare Workers、Durable Objects、KVストレージを使用したGitHub webhookの検証システムです。

## デプロイ済みURL

```
https://github-webhook-worker.mtamaramu.com
```

## 機能

- **Webhook署名検証**: GitHub webhookの`X-Hub-Signature-256`ヘッダーを検証
- **Durable Objects**: 各webhookをDurable Objectで処理し、履歴を保存
- **KVストレージ**: リポジトリのメタデータ（バージョン、gRPCエンドポイント）を保存
- **自動更新**: webhookイベント（push、release、create）受信時にKVのメタデータを自動更新
- **履歴管理**: 受信したwebhookの履歴を取得可能

## アーキテクチャ

```
GitHub → Worker → Durable Object → 検証 & 保存
                      ↓
                   KV更新
                      ↓
                 履歴/メタデータAPI
```

## エンドポイント

### `GET /health`
ヘルスチェックエンドポイント

**レスポンス:**
```json
{
  "status": "ok",
  "service": "GitHub Webhook Worker",
  "version": "1.0.0"
}
```

### `POST /webhook`
GitHub webhookを受信・検証するエンドポイント

**必要なヘッダー:**
- `X-Hub-Signature-256`: GitHubによる署名
- `X-GitHub-Event`: イベントタイプ
- `X-GitHub-Delivery`: 配信ID（オプション）

**レスポンス（成功時）:**
```json
{
  "success": true,
  "event": "push",
  "message": "Webhook verified and processed"
}
```

**レスポンス（失敗時）:**
```json
{
  "success": false,
  "error": "Invalid signature"
}
```

### `GET /history?limit=10`
受信したwebhookの履歴を取得

**クエリパラメータ:**
- `limit`: 取得する件数（デフォルト: 10）

**レスポンス:**
```json
[
  {
    "event": "push",
    "payload": { ... },
    "timestamp": 1234567890,
    "processed": false
  }
]
```

### `POST /repo`
リポジトリのメタデータを保存

**リクエストボディ:**
```json
{
  "repo": "owner/repository",
  "version": "v1.0.0",
  "grpcEndpoint": "grpc://example.com:50051"
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "repo": "owner/repository",
    "version": "v1.0.0",
    "grpcEndpoint": "grpc://example.com:50051",
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### `GET /repo/{owner/repository}`
リポジトリのメタデータを取得

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "repo": "owner/repository",
    "version": "v1.0.0",
    "grpcEndpoint": "grpc://example.com:50051",
    "createdAt": 1234567890,
    "updatedAt": 1234567890
  }
}
```

### `GET /repos?limit=100`
全リポジトリのメタデータを一覧取得

**クエリパラメータ:**
- `limit`: 取得する件数（デフォルト: 100）

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "repo": "owner/repository",
      "version": "v1.0.0",
      "grpcEndpoint": "grpc://example.com:50051",
      "createdAt": 1234567890,
      "updatedAt": 1234567890
    }
  ],
  "count": 1
}
```

### `DELETE /repo/{owner/repository}`
リポジトリのメタデータを削除

**レスポンス:**
```json
{
  "success": true,
  "message": "Repository owner/repository deleted"
}
```

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Webhook Secretの設定

Cloudflare Workersのシークレットとして`WEBHOOK_SECRET`を設定します：

```bash
npx wrangler secret put WEBHOOK_SECRET
```

GitHubのWebhook設定画面で設定したSecretと同じ値を入力してください。

### 3. 開発サーバーの起動

```bash
npm run dev
```

ローカルで `http://localhost:8787` でテストできます。

### 4. デプロイ

```bash
npm run deploy
```

**注意**: 初回デプロイ時、Wranglerが自動的にKV Namespaceを作成します。手動でKVを作成する必要はありません。

## GitHub Webhookの設定

1. GitHubリポジトリの Settings → Webhooks → Add webhook
2. **Payload URL**: `https://your-worker.workers.dev/webhook`
3. **Content type**: `application/json`
4. **Secret**: 任意のシークレット文字列（Workerの`WEBHOOK_SECRET`と同じ値）
5. **Events**: 受信したいイベントを選択
6. **Active**: チェック

## テスト

```bash
npm test
```

## Webhook自動更新について

このWorkerは、以下のGitHubイベントを受信したときに自動的にKVのリポジトリメタデータを更新します：

### 対応イベント

1. **push**: ブランチまたはタグへのプッシュ
   - `refs/tags/v1.0.0` → バージョン `v1.0.0` として保存
   - `refs/heads/main` → バージョン `main` として保存

2. **release**: リリースの作成
   - リリースのタグ名をバージョンとして保存

3. **create**: タグの作成
   - 作成されたタグ名をバージョンとして保存

既存のgRPCエンドポイント情報は保持されます。

## Durable Objectsについて

このWorkerは、各webhookの配信IDごとにDurable Objectインスタンスを作成します。これにより：

- 各webhookの処理が分離される
- webhookの履歴が永続的に保存される
- 並行処理が効率的に行われる

## KVストレージについて

リポジトリのメタデータはKVに保存されます：

- **キー**: `repo:{owner/repository}`
- **値**: JSON形式のメタデータ（repo、version、grpcEndpoint、createdAt、updatedAt）
- **用途**: バージョン管理とgRPCエンドポイントの追跡

## セキュリティ

- HMAC-SHA256による署名検証
- タイミング攻撃を防ぐための定数時間比較
- シークレットは環境変数で管理

## 使用例

### リポジトリメタデータの手動登録

```bash
curl -X POST https://your-worker.workers.dev/repo \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myorg/myrepo",
    "version": "v1.0.0",
    "grpcEndpoint": "grpc://api.example.com:50051"
  }'
```

### メタデータの取得

```bash
curl https://your-worker.workers.dev/repo/myorg/myrepo
```

### 全リポジトリの一覧

```bash
curl https://your-worker.workers.dev/repos
```

## ライセンス

Private