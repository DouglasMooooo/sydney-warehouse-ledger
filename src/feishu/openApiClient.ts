export interface FeishuOpenApiClientConfig { appId: string; appSecret: string }

interface CachedToken { value: string; refreshAt: number }

export class FeishuOpenApiError extends Error {
  readonly code = 'SYSTEM_READ_FAILED';
}

export class FeishuOpenApiClient {
  private token?: CachedToken;
  constructor(
    private readonly config: FeishuOpenApiClientConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!path.startsWith('/open-apis/')) throw new FeishuOpenApiError('Invalid Feishu API path.');
    const url = new URL(path, 'https://open.feishu.cn');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await this.fetchImpl(url, { headers: { authorization: `Bearer ${await this.tenantToken()}` } });
    const body = await parseJson(response);
    if (!response.ok || body.code !== 0) throw new FeishuOpenApiError(`Feishu read failed (${body.code ?? response.status}).`);
    return body.data as T;
  }

  private async tenantToken(): Promise<string> {
    if (this.token && this.token.refreshAt > this.now()) return this.token.value;
    const response = await this.fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: this.config.appId, app_secret: this.config.appSecret }),
    });
    const body = await parseJson(response);
    if (!response.ok || body.code !== 0 || typeof body.tenant_access_token !== 'string' || typeof body.expire !== 'number') {
      throw new FeishuOpenApiError(`Feishu token acquisition failed (${body.code ?? response.status}).`);
    }
    this.token = { value: body.tenant_access_token, refreshAt: this.now() + Math.max(60, body.expire - 300) * 1000 };
    return this.token.value;
  }
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
