import * as v from "valibot";

// 定義 PostgREST 錯誤類型常數
export const POSTGREST_ERROR_TYPE = "POSTGREST_ERROR";

/**
 * 標準 PostgREST 錯誤回應的 Valibot Schema
 * 根據 PostgREST 文件，錯誤通常包含 message, details, hint, code
 */
export const postgrestErrorSchema: v.GenericSchema<{
  message: string;
  details: string | null;
  hint: string | null;
  code: string;
}> = v.object({
  message: v.string(),
  details: v.nullable(v.string()),
  hint: v.nullable(v.string()),
  code: v.string(),
});

export type PostgrestErrorResponse = v.InferOutput<typeof postgrestErrorSchema>;

/**
 * 自定義錯誤類別，用於封裝 PostgREST 的錯誤回應
 * 這取代了原本 SvelteKit 的 error()
 */
export class PostgrestClientError extends Error {
  public readonly type: string = POSTGREST_ERROR_TYPE;
  public readonly status: number;
  public readonly details: string | null;
  public readonly hint: string | null;
  public readonly code: string;

  constructor(status: number, errorData: PostgrestErrorResponse) {
    super(errorData.message);
    this.name = "PostgrestClientError";
    this.status = status;
    this.details = errorData.details;
    this.hint = errorData.hint;
    this.code = errorData.code;

    // 修正 TypeScript 在繼承 Error 時的原型鏈問題
    Object.setPrototypeOf(this, PostgrestClientError.prototype);
  }
}
