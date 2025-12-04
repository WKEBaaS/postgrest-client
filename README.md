# PostgREST Fetch Client

A lightweight, type-safe HTTP client wrapper for PostgREST (Supabase) with [Standard Schema](https://github.com/standard-schema/standard-schema) support.

This is not a full-fledged ORM, but rather an enhanced `fetch` wrapper designed specifically for PostgREST APIs, making it easy to handle authentication, URL parameter composition, and runtime data validation.

## ✨ Features

* **🔒 Type-Safe & Runtime Validation**: Native support for Standard Schema (compatible with Valibot, Zod, ArkType, etc.), ensuring API responses match expectations.
* **🎨 Options Object API**: Modern parameter object pattern with clear, easily extensible syntax.
* **🛡️ Error Handling**: Automatically parses PostgREST standard error format, providing strongly-typed error objects.
* **⚡ Lightweight**: Built on native `fetch` API with no extra dependencies.
* **🔑 Token Management**: Supports global token configuration and per-request override.
* **🧹 Smart Params**: Automatically filters out undefined or null query parameters for more flexible conditional queries.

## 📦 Installation

```bash
npm install @youmin1017/postgrest
```

## 🚀 Quick Start

### 1. Initialize Client

```typescript
import { PostgrestClient } from "@youmin1017/postgrest";

// Initialize with Base URL and optional default Token
const client = new PostgrestClient(
  "https://your-project.example.com",
  "YOUR_JWT_TOKEN"
);
```

### 2. Define Schema (Using Valibot as example)

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

### 3. Making Requests

#### GET Request (With Validation and Dynamic Parameters)

```typescript
// Assume this variable might be undefined
const searchId = undefined;

// Return type is automatically inferred as User[]
const users = await client.get({
  endpoint: "/users",
  params: { 
    select: "*",
    // Supports passing numbers directly, undefined values are automatically filtered out
    id: searchId ? `eq.${searchId}` : undefined, 
    active: true // Supports boolean, automatically converted to string "true"
  },
  schema: v.array(UserSchema), // Pass Schema for validation
});

console.log(users[0].username); // TypeScript provides auto-completion
```

#### GET Request (Without Validation)

If you don't need runtime validation, you can directly use generics:

```typescript
const data = await client.get<any[]>({
  endpoint: "/users",
  params: { id: "eq.1" },
});
```

#### POST (Creating Data)

```typescript
const newUser = await client.post({
  endpoint: "/users",
  data: { username: "new_user", email: "test@example.com" },
  schema: v.array(UserSchema), // PostgREST typically returns arrays
  headers: { Prefer: "return=representation" }, // Tell PostgREST to return the created data
});
```

## 📖 API Reference

All methods accept an **Options Object**.

### Common Options (Base Options)

All request methods (`get`, `post`, `patch`, `delete`) support the following properties:

| Property | Type | Description |
| :--- | :--- | :--- |
| `endpoint` | `string` | **Required**. API path (e.g., `/users`). |
| `schema` | `StandardSchema` | Optional. Schema for validating response data. If provided, return type is automatically inferred. |
| `token` | `string` | Optional. Override default Auth Token. |
| `headers` | `HeadersInit` | Optional. Custom HTTP Headers. |
| `signal` | `AbortSignal` | Optional. For request cancellation. |
| ... | `RequestInit` | Supports all native `fetch` options. |

### `client.get(options)`

Used for reading data.

* **options.params**: `Record<string, string | number | boolean | undefined | null>` (Optional)
  * URL query parameters.
  * Supports basic types, automatically converted to strings.
  * If value is undefined or null, the parameter is automatically filtered and won't appear in the URL.
  * Example: `{ select: '*', id: 'eq.1', active: true, offset: undefined }`

### `client.getFirst(options)`

Helper method for reading a **single record**. It automatically adds `limit=1` and unwraps the array to return the first item. Throws an error if no data is found.

```typescript
const user = await client.getFirst({
  endpoint: "/users",
  params: { id: "eq.123" },
  schema: UserSchema, // Note: Pass the Schema for a single object, not an array
});
```

### `client.post(options) / client.patch(options)`

Used for creating or modifying data.

* **options.data**: `object` (Optional) - JSON Body to send.

### `client.delete(options)`

Used for deleting data.

* **options.params**: `Record<string, string | number | boolean | undefined | null>` (Optional) - Used to specify deletion conditions.

-----

## ⚠️ Error Handling

When PostgREST returns a non-2xx status code, the Client throws a `PostgrestClientError`. This error object contains detailed error information returned by the server.

```typescript
import { PostgrestClientError } from "@youmin1017/postgrest";

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

## Standard Schema Support

This package follows the [Standard Schema V1](https://github.com/standard-schema/spec) specification. This means you can use any validation library that conforms to this specification, without being locked into a specific package:

* [Valibot](https://valibot.dev/) (Recommended)
* [Zod](https://zod.dev/) (Requires `zod-standard-schema` wrapper or Zod v3.24+)
* [ArkType](https://arktype.io/)

-----

## License

MIT
