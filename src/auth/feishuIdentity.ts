export interface VerifiedFeishuUser {
  openId: string;
  displayName?: string;
}

export interface FeishuIdentityProvider {
  resolveUser(authCode: string): Promise<VerifiedFeishuUser>;
}

export interface FeishuOAuthConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
  scopes?: string[];
}

export class FeishuIdentityError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED';

  constructor(message: string, readonly stage: 'INPUT' | 'TOKEN_EXCHANGE' | 'USER_INFO' | 'CONFIGURATION' = 'CONFIGURATION', readonly providerCode?: number) {
    super(message);
    this.name = 'FeishuIdentityError';
  }
}

export class FeishuOAuthIdentityProvider implements FeishuIdentityProvider {
  constructor(private readonly config: FeishuOAuthConfig, private readonly fetchImpl: typeof fetch = fetch) {}

  async resolveUser(authCode: string): Promise<VerifiedFeishuUser> {
    if (!authCode.trim()) throw new FeishuIdentityError('Invalid Feishu login code.', 'INPUT');
    const tokenRequest = new URLSearchParams({
      grant_type: 'authorization_code', client_id: this.config.appId, client_secret: this.config.appSecret,
      code: authCode, redirect_uri: this.config.redirectUri,
    });
    const tokenResponse = await this.fetchImpl('https://accounts.feishu.cn/oauth/v3/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: tokenRequest,
    });
    const token = await safeJson(tokenResponse, 'TOKEN_EXCHANGE') as { code?: number; access_token?: string; error?: string };
    if (!tokenResponse.ok || token.code !== 0 || !token.access_token) {
      throw new FeishuIdentityError('Feishu login code verification failed.', 'TOKEN_EXCHANGE', numericCode(token.code));
    }
    const userResponse = await this.fetchImpl('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    const user = await safeJson(userResponse, 'USER_INFO') as { code?: number; data?: { open_id?: string; name?: string } };
    if (!userResponse.ok || user.code !== 0 || !user.data?.open_id) {
      throw new FeishuIdentityError('Feishu user verification failed.', 'USER_INFO', numericCode(user.code));
    }
    const result: VerifiedFeishuUser = { openId: user.data.open_id };
    if (user.data.name) result.displayName = user.data.name;
    return result;
  }
}

// Feishu documents PKCE as optional for confidential server applications. This
// flow authenticates the token exchange with the server-only client secret and
// retains the short-lived state cookie for login CSRF protection.
export function createFeishuAuthorizationUrl(config: FeishuOAuthConfig, state: string): string {
  const url = new URL('https://accounts.feishu.cn/open-apis/authen/v1/authorize');
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  if (config.scopes?.length) url.searchParams.set('scope', config.scopes.join(' '));
  return url.toString();
}

export function feishuOAuthConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): FeishuOAuthConfig {
  const appId = required(env, 'FEISHU_APP_ID');
  const appSecret = required(env, 'FEISHU_APP_SECRET');
  const redirectUri = required(env, 'FEISHU_OAUTH_REDIRECT_URI');
  const scopes = (env.FEISHU_OAUTH_SCOPES ?? '').split(/[ ,]+/).filter(Boolean);
  return scopes.length ? { appId, appSecret, redirectUri, scopes } : { appId, appSecret, redirectUri };
}

async function safeJson(response: Response, stage: 'TOKEN_EXCHANGE' | 'USER_INFO'): Promise<unknown> {
  try { return await response.json(); } catch { throw new FeishuIdentityError('Invalid Feishu identity response.', stage); }
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new FeishuIdentityError(`Missing server identity configuration: ${name}`, 'CONFIGURATION');
  return value;
}

function numericCode(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}
