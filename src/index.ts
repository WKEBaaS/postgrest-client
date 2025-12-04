import * as v from "valibot";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  POSTGREST_ERROR_TYPE,
  PostgrestClientError,
  postgrestErrorSchema,
} from "./error";

export { POSTGREST_ERROR_TYPE, PostgrestClientError };

// --- 定義 Request Options ---

// 基礎選項 (所有請求共有)
interface BaseRequestOptions<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends RequestInit {
  endpoint: string;
  token?: string | null; // 可選，若不傳則使用 class 預設值
  schema?: TSchema; // 用於驗證回應
}

// GET / DELETE 專用選項 (通常帶 Query String)
export interface GetRequestOptions<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends BaseRequestOptions<TSchema> {
  params?: Record<string, string>;
}

// POST / PATCH 專用選項 (通常帶 Body)
export interface PostRequestOptions<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends BaseRequestOptions<TSchema> {
  data?: object; // Payload
}

export class PostgrestClient {
  private baseURL: URL;
  private defaultToken: string | null = null;

  // 建構子可以接收預設 token
  constructor(baseURL: string | URL, defaultToken: string | null = null) {
    this.baseURL = new URL(baseURL);
    this.defaultToken = defaultToken;
  }

  // 允許隨時更新預設 token
  public setToken(token: string | null): void {
    this.defaultToken = token;
  }

  // ... (validateData 方法保持不變) ...
  private async validateData<T extends StandardSchemaV1>(
    schema: T,
    data: unknown,
  ): Promise<StandardSchemaV1.InferOutput<T>> {
    if (!("~standard" in schema)) {
      throw new Error("Provided schema is not a valid Standard Schema");
    }
    const result = await schema["~standard"].validate(data);
    if (result.issues) {
      throw new Error(
        `Schema Validation Error: ${JSON.stringify(result.issues, null, 2)}`,
      );
    }
    return result.value;
  }

  /**
   * 統一的內部 fetch 實作
   * 接收一個合併後的 InternalOptions
   */
  private async fetchWithAuth<T>(
    method: string,
    options: BaseRequestOptions & {
      params?: Record<string, string>;
      data?: object;
    },
  ): Promise<T> {
    const { endpoint, token, params, data, schema, ...fetchOptions } = options;

    // 1. 處理 URL 與 Query Params
    let urlString = endpoint;
    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      const queryString = searchParams.toString();
      urlString += (urlString.includes("?") ? "&" : "?") + queryString;
    }
    const url = new URL(urlString.replace(/^\//, ""), this.baseURL);

    // 2. 處理 Headers
    const headers = new Headers(fetchOptions.headers || {});

    // 優先使用 options 傳入的 token，沒有則使用 class 預設 token
    const effectiveToken = token !== undefined ? token : this.defaultToken;

    if (effectiveToken) {
      headers.set("Authorization", `Bearer ${effectiveToken}`);
    }
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json");

    // 3. 執行 Fetch
    const response = await fetch(url, {
      ...fetchOptions,
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    });

    // 4. 錯誤處理
    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        throw new Error(
          `HTTP Error ${response.status}: Failed to parse JSON error response`,
        );
      }

      const parsed = await v.safeParseAsync(postgrestErrorSchema, errorData);
      if (!parsed.success) {
        console.error("PostgREST Error Parsing Failed:", parsed.issues);
        throw new Error(
          `Internal Client Error: Invalid error format from server (${response.status})`,
        );
      }
      throw new PostgrestClientError(response.status, parsed.output);
    }

    if (response.status === 204 || response.status === 202) {
      return null as T;
    }

    const resData = await response.json();

    // 5. Schema 驗證
    if (schema) {
      return this.validateData(schema, resData) as Promise<T>;
    }

    return resData as T;
  }

  // --- 公開 API (使用重載 Overload) ---
  // 使用 Options Object 後，Overload 會變得更乾淨

  // GET
  public get<S extends StandardSchemaV1>(
    options: GetRequestOptions<S> & { schema: S }, // 強制要求 schema 存在的情況
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public get<T = unknown>(
    options: GetRequestOptions, // 沒有 schema 的情況
  ): Promise<T>;

  public get(options: GetRequestOptions) {
    return this.fetchWithAuth("GET", options);
  }

  // GET FIRST
  public async getFirst<S extends StandardSchemaV1>(
    options: GetRequestOptions<S> & { schema: S },
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public async getFirst<T = unknown>(
    options: GetRequestOptions,
  ): Promise<T>;

  public async getFirst(options: GetRequestOptions) {
    const allParams = { ...options.params, limit: "1" };

    // 呼叫內部 fetch，但不傳 schema，因為我們要先解開陣列
    const data = await this.fetchWithAuth<unknown[]>("GET", {
      ...options,
      params: allParams,
      schema: undefined, // 暫時移除 schema
    });

    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      if (options.schema) {
        return this.validateData(options.schema, firstItem);
      }
      return firstItem;
    } else {
      throw new Error("No data found");
    }
  }

  // POST
  public post<S extends StandardSchemaV1>(
    options: PostRequestOptions<S> & { schema: S },
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public post<T = unknown>(
    options: PostRequestOptions,
  ): Promise<T>;

  public post(options: PostRequestOptions) {
    return this.fetchWithAuth("POST", options);
  }

  // PATCH
  public patch<S extends StandardSchemaV1>(
    options: PostRequestOptions<S> & { schema: S },
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public patch<T = unknown>(
    options: PostRequestOptions,
  ): Promise<T>;

  public patch(options: PostRequestOptions) {
    return this.fetchWithAuth("PATCH", options);
  }

  // DELETE
  public delete<S extends StandardSchemaV1>(
    options: GetRequestOptions<S> & { schema: S },
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public delete<T = unknown>(
    options: GetRequestOptions,
  ): Promise<T>;

  public delete(options: GetRequestOptions) {
    return this.fetchWithAuth("DELETE", options);
  }
}
