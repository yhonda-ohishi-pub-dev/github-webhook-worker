# Example Client Worker

このWorkerは、Service Bindingsを使用して`github-webhook-worker`のリポジトリメタデータAPIにアクセスする方法を示すサンプルです。

## Service Bindingsとは

Service Bindingsは、Cloudflare Workers間で安全に内部通信を行うための機能です：

- **インターネットを経由しない** - 内部ネットワークで直接通信
- **認証不要** - Worker間の通信は信頼されている
- **高速** - ネットワークホップがない
- **安全** - 外部からアクセス不可

## セットアップ

### 1. wrangler.jsoncの設定

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

- `binding`: コード内で使用する変数名
- `service`: 接続先Workerの名前（wrangler.jsoncの`name`フィールド）

### 2. 型定義の生成

```bash
npx wrangler types
```

これにより、`WEBHOOK_WORKER`の型定義が自動生成されます。

### 3. デプロイ

```bash
npx wrangler deploy
```

**注意**: 両方のWorker（`github-webhook-worker`と`example-client-worker`）が同じCloudflareアカウント内にデプロイされている必要があります。

## 使い方

### 基本的なAPI呼び出し

```typescript
// リポジトリ一覧を取得
const response = await env.WEBHOOK_WORKER.fetch(
  new Request('https://fake-host/repos', {
    headers: {
      'X-Service-Binding': 'true'
    }
  })
);

const data = await response.json();
```

### 重要なポイント

1. **URL**: `https://fake-host`を使用（実際のドメインではない）
2. **ヘッダー**: `X-Service-Binding: true`を必ず含める
3. **パス**: 通常のHTTP APIと同じパス（`/repos`, `/repo/{name}`など）

## サンプルエンドポイント

このWorkerは以下のエンドポイントを提供します：

### `GET /list-repos`
すべてのリポジトリメタデータを一覧表示

### `GET /get-repo/{owner/repo}`
特定のリポジトリメタデータを取得

例: `/get-repo/example/my-repo`

### `POST /update-repo`
リポジトリメタデータを作成または更新

**リクエストボディ**:
```json
{
  "repo": "example/my-repo",
  "version": "v1.0.0",
  "grpcEndpoint": "grpc://api.example.com:50051"
}
```

### `DELETE /delete-repo/{owner/repo}`
リポジトリメタデータを削除

### `GET /example-workflow`
完全なワークフローの例（一覧取得 → 更新 → 取得）

## カスタマイズ

このサンプルコードを自分のWorkerに組み込む場合：

1. `wrangler.jsonc`に`services`設定を追加
2. `env.WEBHOOK_WORKER.fetch()`を使ってAPIを呼び出し
3. 必ず`X-Service-Binding: true`ヘッダーを含める

## セキュリティ

Service Bindingsを使用することで：

- ✅ 外部からのアクセスは完全にブロック
- ✅ APIキーや認証トークンは不要
- ✅ 同じアカウント内のWorkerのみアクセス可能
- ✅ インターネット経由での情報漏洩を防止

## トラブルシューティング

### エラー: "Access denied. This endpoint requires Service Binding."

**原因**: `X-Service-Binding: true`ヘッダーが含まれていない、またはService Bindings経由でアクセスしていない。

**解決策**:
```typescript
// ❌ 間違い
await env.WEBHOOK_WORKER.fetch('https://fake-host/repos')

// ✅ 正しい
await env.WEBHOOK_WORKER.fetch(
  new Request('https://fake-host/repos', {
    headers: { 'X-Service-Binding': 'true' }
  })
)
```

### エラー: "WEBHOOK_WORKER is not defined"

**原因**: `wrangler.jsonc`にService Bindings設定がない、または型定義が古い。

**解決策**:
1. `wrangler.jsonc`の`services`配列を確認
2. `npx wrangler types`を実行して型定義を再生成
