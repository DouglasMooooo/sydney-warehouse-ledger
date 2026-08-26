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
  if (hasErrorCode(error, 'AUTHENTICATION_REQUIRED')) {
    return { code: 'AUTHENTICATION_REQUIRED', message: '需要有效的飞书身份。' };
  }
  if (hasErrorCode(error, 'PERMISSION_DENIED')) {
    return { code: 'PERMISSION_DENIED', message: '当前用户无权执行此操作。' };
  }
  if (hasErrorCode(error, 'RATE_LIMITED')) return { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试。' };
  if (hasErrorCode(error, 'READ_ONLY_RELEASE')) return { code: 'READ_ONLY_RELEASE', message: '只读试运行期间禁止业务写入。' };
  const workflowErrors: Record<string, string> = {
    DUPLICATE_IN_BATCH: '批次中存在重复 SN，请删除重复项后重试。',
    BATCH_SN_LIST_REQUIRED: '请至少输入一个 SN。',
    BATCH_SN_LIMIT_EXCEEDED: '批量移库最多 100 台；维修完成因每台生成两条流水，最多 50 台。',
    SN_NOT_IN_CURRENT_INVENTORY: '至少一个 SN 不在当前库存中，请检查后重试。',
    REPAIR_COMPLETE_REQUIRES_PENDING_REPAIR: '至少一个 SN 当前不是待修状态，不能完成维修。',
    MOVE_SOURCE_EQUALS_TARGET: '目标库位与至少一台机器的当前库位相同。',
  };
  for (const [code, safeMessage] of Object.entries(workflowErrors)) {
    if (message.includes(code)) return { code, message: safeMessage };
  }
  if (message.includes('XLSX_NOT_SUPPORTED')) {
    return { code: 'XLSX_NOT_SUPPORTED', message: '当前仅支持文本原型，尚未启用 XLSX 上传。', field: 'sourceFileName' };
  }
  if (message.includes('UNSUPPORTED_CLIENT_FIELD')) {
    return { code: 'UNSUPPORTED_CLIENT_FIELD', message: '请求包含不受支持的字段。' };
  }
  if (error instanceof TypeError) return { code: 'INVALID_REQUEST', message: '请求数据格式无效。' };
  return { code: 'SYSTEM_READ_FAILED', message: '系统读取失败，请联系管理员。' };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error
    && (error as { code?: unknown }).code === code;
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
