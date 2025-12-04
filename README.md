# PostgREST Fetch Client

一個輕量、型別安全且支援 [Standard Schema](https://github.com/standard-schema/standard-schema) 的 PostgREST (Supabase) HTTP 客戶端封裝。

這不是一個完整的 ORM，而是一個強化的 `fetch` 包裝器，專為 PostgREST API 設計，讓你能輕鬆處理認證、URL 參數組合以及執行時期的資料驗證 (Runtime Validation)。

## ✨ 特色

* **🔒 Type-Safe & Runtime Validation**: 原生支援 Standard Schema (相容 Valibot, Zod, ArkType 等)，確保 API 回傳資料符合預期。
* **🎨 Options Object API**: 使用現代化的參數物件模式，語法清晰且易於擴充。
* **🛡️ Error Handling**: 自動解析 PostgREST 標準錯誤格式，提供強型別的錯誤物件。
* **⚡ Lightweight**: 基於原生 `fetch` API，無多餘依賴。
* **🔑 Token Management**: 支援全域 Token 設定與單次請求覆寫。

## 📦 安裝

```bash
npm install @youmin1017/postgrest
```

## 🚀 快速開始

### 1\. 初始化 Client

```typescript
import { PostgrestClient } from "your-package-name";

// 初始化時可傳入 Base URL 和選填的預設 Token
const client = new PostgrestClient(
  "https://your-project.example.com",
  "YOUR_JWT_TOKEN"
);
```

### 2\. 定義 Schema (使用 Valibot 為例)

```typescript
import * as v from "valibot";

const UserSchema = v.object({
  id: v.number(),
  username: v.string(),
  email: v.string(),
  created_at: v.string(),
});

type User = v.InferOutput<typeof UserSchema>;
```

### 3\. 發送請求

#### GET 請求 (帶驗證)

```typescript
// 自動推斷回傳型別為 User[]
const users = await client.get({
  endpoint: "/users",
  params: { select: "*" },
  schema: v.array(UserSchema), // 傳入 Schema 進行驗證
});

console.log(users[0].username); // TypeScript 會有自動補全
```

#### GET 請求 (無驗證)

如果你不需要執行時驗證，也可以直接使用泛型：

```typescript
const data = await client.get<any[]>({
  endpoint: "/users",
  params: { id: "eq.1" },
});
```

#### POST (新增資料)

```typescript
const newUser = await client.post({
  endpoint: "/users",
  data: { username: "new_user", email: "test@example.com" },
  schema: v.array(UserSchema), // PostgREST 通常回傳陣列
  headers: { Prefer: "return=representation" }, // 告訴 PostgREST 回傳新增的資料
});
```

## 📖 API 參考

所有方法都接收一個 **Options Object**。

### 共用選項 (Base Options)

所有請求方法 (`get`, `post`, `patch`, `delete`) 都支援以下屬性：

| 屬性 | 型別 | 說明 |
| :--- | :--- | :--- |
| `endpoint` | `string` | **必填**。API 路徑 (例如 `/users`)。 |
| `schema` | `StandardSchema` | 選填。用於驗證回應資料的 Schema。若傳入，回傳型別將自動推斷。 |
| `token` | `string` | 選填。覆寫預設的 Auth Token。 |
| `headers` | `HeadersInit` | 選填。自定義 HTTP Headers。 |
| `signal` | `AbortSignal` | 選填。用於取消請求。 |
| ... | `RequestInit` | 支援所有原生 `fetch` 的選項。 |

### `client.get(options)`

用於讀取資料。

* **options.params**: `Record<string, string>` (選填) - URL 查詢參數。
  * 範例：`{ select: '*', id: 'eq.1' }`

### `client.getFirst(options)`

用於讀取**單筆**資料的輔助方法。它會自動加入 `limit=1`，並解開陣列回傳第一項。如果找不到資料會拋出錯誤。

```typescript
const user = await client.getFirst({
  endpoint: "/users",
  params: { id: "eq.123" },
  schema: UserSchema, // 注意：這裡傳入單個物件的 Schema，而非陣列
});
```

### `client.post(options) / client.patch(options)`

用於新增或修改資料。

* **options.data**: `object` (選填) - 要傳送的 JSON Body。

### `client.delete(options)`

用於刪除資料。

* **options.params**: `Record<string, string>` (選填) - 用於指定刪除條件。

-----

## ⚠️ 錯誤處理

當 PostgREST 回傳非 2xx 的狀態碼時，Client 會拋出 `PostgrestClientError`。該錯誤物件包含伺服器回傳的詳細錯誤資訊。

```typescript
import { PostgrestClientError } from "your-package-name";

try {
  await client.get({ endpoint: "/non-existent-table" });
} catch (error) {
  if (error instanceof PostgrestClientError) {
    console.error("HTTP Status:", error.status); // e.g., 404
    console.error("Error Code:", error.details.code); // e.g., "42P01"
    console.error("Message:", error.details.message); // e.g., "relation does not exist"
  } else {
    console.error("Unknown error:", error);
  }
}
```

## Standard Schema 支援

本套件遵循 [Standard Schema V1](https://www.google.com/search?q=https://github.com/standard-schema/spec) 規範。這意味著你可以使用任何符合該規範的驗證庫，無需綁定特定套件：

* [Valibot](https://valibot.dev/) (推薦)
* [Zod](https://zod.dev/) (需使用 `zod-standard-schema` wrapper 或 Zod v3.24+)
* [ArkType](https://arktype.io/)

-----

## License

MIT
