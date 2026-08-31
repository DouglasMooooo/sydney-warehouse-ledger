export interface FeishuOpenApiClientConfig { appId: string; appSecret: string }

interface CachedToken { value: string; refreshAt: number; expiryAt: number }

export class FeishuOpenApiError extends Error {
  readonly code = 'SYSTEM_READ_FAILED';
  readonly feishuCode: number | undefined;
  readonly feishuMsg: string | undefined;
  readonly httpStatus: number | undefined;
  readonly requestId: string | undefined;
  constructor(message: string, details?: { feishuCode?: number | undefined; feishuMsg?: string | undefined; httpStatus?: number | undefined; requestId?: string | undefined }) {
    super(message);
    this.name = 'FeishuOpenApiError';
    this.feishuCode = details?.feishuCode;
    this.feishuMsg = details?.feishuMsg;
    this.httpStatus = details?.httpStatus;
    this.requestId = details?.requestId;
  }
}

export class FeishuOpenApiClient {
  private token?: CachedToken;
  constructor(
    private readonly config: FeishuOpenApiClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    return this.request<T>('GET', path, undefined, params);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, params: Record<string, string> = {}): Promise<T> {
    if (!path.startsWith('/open-apis/')) throw new FeishuOpenApiError('Invalid Feishu API path.');
    const url = new URL(path, 'https://open.feishu.cn');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetchImpl(url, {
      method,
      headers: { authorization: `Bearer ${await this.tenantToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const responseBody = await parseJson(response);
    if (!response.ok || responseBody.code !== 0) {
      const feishuCode = typeof responseBody.code === 'number' ? responseBody.code : undefined;
      const feishuMsg = typeof responseBody.msg === 'string' ? responseBody.msg : undefined;
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-tt-logid') ?? undefined;
      const detail = [feishuMsg, requestId ? `request_id=${requestId}` : undefined].filter(Boolean).join(' · ');
      throw new FeishuOpenApiError(`Feishu ${method.toLowerCase()} failed (${feishuCode ?? response.status})${detail ? `: ${detail}` : '.'}`, { feishuCode, feishuMsg, httpStatus: response.status, requestId });
    }
    return responseBody.data as T;
  }

  private async tenantToken(): Promise<string> {
    if (this.token && this.token.refreshAt > this.now() && this.token.expiryAt > this.now()) return this.token.value;
    const response = await this.fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
    });
    const body = await parseJson(response);
    if (!response.ok || body.code !== 0 || typeof body.tenant_access_token !== 'string' || typeof body.expire !== 'number' || body.expire <= 0) {
      const requestId = response.headers.get('x-request-id') ?? response.headers.get('x-tt-logid') ?? undefined;
      const feishuCode = typeof body.code === 'number' ? body.code : undefined;
      const feishuMsg = typeof body.msg === 'string' ? body.msg : undefined;
      throw new FeishuOpenApiError(`Feishu token acquisition failed (${feishuCode ?? response.status})${feishuMsg ? `: ${feishuMsg}` : '.'}`, { feishuCode, feishuMsg, httpStatus: response.status, requestId });
    }
    const acquiredAt = this.now();
    const expiryAt = acquiredAt + body.expire * 1000;
    this.token = { value: body.tenant_access_token, refreshAt: tokenRefreshAt(acquiredAt, body.expire), expiryAt };
    return this.token.value;
  }
}

/** Refresh at 50–80% of TTL, always strictly before the server-declared expiry. */
export function tokenRefreshAt(acquiredAtMs: number, expireSeconds: number): number {
  if (!Number.isFinite(expireSeconds) || expireSeconds <= 0) throw new FeishuOpenApiError('Feishu token TTL is invalid.');
  const ttlMs = expireSeconds * 1000;
  const refreshDelay = Math.min(ttlMs * 0.8, Math.max(ttlMs - 300_000, ttlMs * 0.5));
  return acquiredAtMs + refreshDelay;
}

export function openApiClientFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): FeishuOpenApiClient {
  const appId = env.FEISHU_APP_ID?.trim(), appSecret = env.FEISHU_APP_SECRET?.trim();
  if (!appId || !appSecret) throw new FeishuOpenApiError('Feishu OpenAPI credentials are not configured.');
  return new FeishuOpenApiClient({ appId, appSecret });
}

async function parseJson(response: Response): Promise<Record<string, any>> {
  try { return await response.json() as Record<string, any>; }
  catch { throw new FeishuOpenApiError('Feishu returned an invalid response.'); }
}
