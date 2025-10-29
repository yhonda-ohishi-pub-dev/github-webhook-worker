# GitHub Webhook Worker

Cloudflare Workers、Durable Objects、KVストレージを使用したGitHub webhookの検証システムです。

## デプロイ済みURL

本番環境:
```
https://github-webhook-worker.mtamaramu.com
```

## 機能

- **Webhook署名検証**: GitHub webhookの`X-Hub-Signature-256`ヘッダーを検証
- **Durable Objects**: 各webhookをDurable Objectで処理し、履歴を保存
- **KVストレージ**: リポジトリのメタデータ（バージョン、gRPCエンドポイント）を保存
- **自動更新**: webhookイベント（push、release、create）受信時にKVのメタデータを自動更新
- **履歴管理**: 受信したwebhookの履歴を取得可能
- **Service Bindings**: リポジトリメタデータAPIは内部通信のみ（外部アクセス不可）

## アーキテクチャ

```
GitHub → Worker → Durable Object → 検証 & 保存
                      ↓
                   KV更新
                      ↓
                 履歴/メタデータAPI
```

## エンドポイント

### 公開エンドポイント（インターネット経由でアクセス可能）

#### `GET /health`
ヘルスチェックエンドポイント

**レスポンス:**
```json
{
  "status": "ok",
  "service": "GitHub Webhook Worker",
  "version": "1.0.0"
}
```

#### `POST /webhook`
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

#### `GET /history?limit=10`
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

### Service Binding限定エンドポイント（内部通信のみ）

> ⚠️ これらのエンドポイントは、Service Bindingsを使用した同じアカウント内のWorkerからのみアクセス可能です。
> 外部からのアクセスは403 Forbiddenエラーを返します。

#### `POST /repo` 🔒
リポジトリのメタデータを保存

**必要なヘッダー:**
- `X-Service-Binding: true`

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

#### `GET /repo/{owner/repository}` 🔒
リポジトリのメタデータを取得

**必要なヘッダー:**
- `X-Service-Binding: true`

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

#### `GET /repos?limit=100` 🔒
全リポジトリのメタデータを一覧取得

**必要なヘッダー:**
- `X-Service-Binding: true`

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

#### `DELETE /repo/{owner/repository}` 🔒
リポジトリのメタデータを削除

**必要なヘッダー:**
- `X-Service-Binding: true`

**レスポンス:**
```json
{
  "success": true,
  "message": "Repository owner/repository deleted"
}
```

## Service Bindingsの使い方

### 概要

リポジトリメタデータAPI（`/repo`, `/repos`）は、Service Bindingsを使用した内部通信のみアクセス可能です。
これにより、外部からの不正アクセスを完全に防ぎ、同じアカウント内のWorkerのみがメタデータにアクセスできます。

### クライアントWorkerの設定

#### 1. `wrangler.jsonc`に追加

```json
{
  "services": [
    {
      "binding": "WEBHOOK_WORKER",
      "service": "github-webhook-worker"
    }
  ]
}
```

#### 2. コード例

```typescript
export default {
  async fetch(request, env, ctx) {
    // リポジトリ一覧を取得
    const response = await env.WEBHOOK_WORKER.fetch(
      new Request('https://fake-host/repos', {
        headers: {
          'X-Service-Binding': 'true'
        }
      })
    );

    const data = await response.json();
    return new Response(JSON.stringify(data));
  }
};
```

#### 重要なポイント

- **URL**: `https://fake-host`を使用（実際のドメインではない）
- **ヘッダー**: `X-Service-Binding: true`を必ず含める
- **同じアカウント**: 両方のWorkerが同じCloudflareアカウントにデプロイされている必要がある

### サンプルコード

完全なクライアントWorkerのサンプルは [`example-client-worker/`](example-client-worker/) ディレクトリを参照してください。

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

### Webhook検証
- **HMAC-SHA256署名検証**: GitHub Webhookの署名を検証
- **タイミング攻撃対策**: 定数時間比較を使用
- **シークレット管理**: 環境変数で安全に管理

### リポジトリメタデータAPI
- **Service Bindings限定**: 外部からのアクセスを完全にブロック
- **内部通信のみ**: 同じアカウント内のWorkerのみアクセス可能
- **ゼロトラスト**: 追加の認証・認可レイヤー不要（Worker間通信は信頼されている）
- **情報漏洩防止**: インターネット経由でのアクセス不可

## 使用例

### リポジトリメタデータの操作（Service Binding経由）

⚠️ `/repo`エンドポイントはService Binding限定です。外部からの直接アクセスはできません。

クライアントWorkerからの使用例：

```typescript
// リポジトリメタデータの登録/更新
const response = await env.WEBHOOK_WORKER.fetch(
  new Request('https://fake-host/repo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Binding': 'true'
    },
    body: JSON.stringify({
      repo: 'myorg/myrepo',
      version: 'v1.0.0',
      grpcEndpoint: 'grpc://api.example.com:50051'
    })
  })
);

// リポジトリメタデータの取得
const getResponse = await env.WEBHOOK_WORKER.fetch(
  new Request('https://fake-host/repo/myorg/myrepo', {
    headers: { 'X-Service-Binding': 'true' }
  })
);

// 全リポジトリの一覧
const listResponse = await env.WEBHOOK_WORKER.fetch(
  new Request('https://fake-host/repos', {
    headers: { 'X-Service-Binding': 'true' }
  })
);
```

完全なサンプルコードは [`example-client-worker/`](example-client-worker/) を参照してください。

## ライセンス

Private