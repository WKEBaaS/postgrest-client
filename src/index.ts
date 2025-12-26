import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as v from "valibot";
import { POSTGREST_ERROR_TYPE, PostgrestClientError, postgrestErrorSchema } from "./error";

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

// 定義允許的參數值類型 (支援undefined 以便過濾)
type ParamValue = string | number | boolean | undefined | null;

// GET / DELETE 專用選項 (通常帶 Query String)
export interface GetRequestOptions<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends BaseRequestOptions<TSchema> {
  params?: Record<string, ParamValue>;
}

// POST / PATCH 專用選項 (通常帶 Body)
export interface PostRequestOptions<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends BaseRequestOptions<TSchema> {
  data?: object; // Payload
}

export class PostgrestClient {
  // [修改 1] baseURL 改為儲存原始輸入，不強制的 URL 物件
  private baseURL: string | URL;
  private defaultToken: string | null = null;

  constructor(baseURL: string | URL, defaultToken: string | null = null) {
    // [修改 2] 移除 new URL()。這裡不再進行解析，防止 Build 時崩潰
    this.baseURL = baseURL;
    this.defaultToken = defaultToken;
  }

  public setToken(token: string | null): void {
    this.defaultToken = token;
  }

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
      params?: Record<string, ParamValue>;
      data?: object;
    },
  ): Promise<T> {
    const { endpoint, token, params, data, schema, ...fetchOptions } = options;

    // [修改 3] URL 解析邏輯移動到請求當下
    let url: URL;
    try {
      // 如果 this.baseURL 是 undefined (例如 build 時 env 沒抓到)，這裡會 throw
      // 但因為是在 Runtime (呼叫 fetch 時) 才執行，所以不會影響 Build
      if (!this.baseURL) {
        throw new Error("Base URL is not defined");
      }
      const base = new URL(this.baseURL);
      // 處理 endpoint 開頭的斜線，避免雙重斜線問題
      const cleanEndpoint = endpoint.replace(/^\//, "");
      url = new URL(cleanEndpoint, base);
    } catch (error) {
      // 這裡可以捕捉到 "Invalid URL" 的錯誤，並提供更清楚的訊息
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to construct URL (base: ${this.baseURL}, endpoint: ${endpoint}): ${msg}`);
    }

    // 1. 處理 Query Params (直接操作 URL 物件)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

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

  // GET
  public get<S extends StandardSchemaV1>(
    options: GetRequestOptions<S> & { schema: S },
  ): Promise<StandardSchemaV1.InferOutput<S>>;

  public get<T = unknown>(
    options: GetRequestOptions,
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
    const baseParams = options.params || {};
    const allParams = { ...baseParams, limit: "1" };

    const data = await this.fetchWithAuth<unknown[]>("GET", {
      ...options,
      params: allParams,
      schema: undefined,
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

// [修改 4] 允許 createPostgrestClient 接收 undefined
// 這讓你在 SvelteKit 中可以直接傳入 env.URL 即使它可能是 undefined
export function createPostgrestClient(
  baseURL: string | URL | undefined,
  defaultToken: string | null = null,
): PostgrestClient {
  // 如果傳入 undefined，我們給一個空字串或保留 undefined，
  // 錯誤會在呼叫 API (fetchWithAuth) 時才拋出
  return new PostgrestClient(baseURL || "", defaultToken);
}
