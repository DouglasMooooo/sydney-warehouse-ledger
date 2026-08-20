export interface ApiErrorContract {
  code: string;
  message: string;
  field?: string;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiErrorContract };

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { ok: true, data };
}

export function apiFailure(code: string, message: string, field?: string): ApiResponse<never> {
  return field ? { ok: false, error: { code, message, field } } : { ok: false, error: { code, message } };
}

export function clientSafeError(error: unknown): ApiErrorContract {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('XLSX_NOT_SUPPORTED')) {
    return { code: 'XLSX_NOT_SUPPORTED', message: '当前仅支持文本原型，尚未启用 XLSX 上传。', field: 'sourceFileName' };
  }
  if (message.includes('UNSUPPORTED_CLIENT_FIELD')) {
    return { code: 'UNSUPPORTED_CLIENT_FIELD', message: '请求包含不受支持的字段。' };
  }
  if (error instanceof TypeError) return { code: 'INVALID_REQUEST', message: '请求数据格式无效。' };
  return { code: 'SYSTEM_READ_FAILED', message: '系统读取失败，请联系管理员。' };
}

/** Log only a bounded, redacted error summary; never serialize arbitrary objects or response bodies. */
export function serverSafeErrorSummary(error: unknown): { name: string; message: string } {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw
    .replace(
      /\b(tenant_access_token|access_token|app_secret|client_secret|token|secret|credential|authorization|password)\b\s*[:=]\s*(?:Bearer\s+\S+|"[^"]*"|'[^']*'|\S+)/gi,
      '$1=[REDACTED]',
    )
    .slice(0, 500);
  return { name, message };
}
