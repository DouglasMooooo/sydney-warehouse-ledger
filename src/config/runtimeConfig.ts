import { assertReadOnlyRelease } from '../safety/readOnlyRelease.js';

export const UAT_MODE = 'READ_ONLY_UAT' as const;

const AUTH_KEYS = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_OAUTH_REDIRECT_URI', 'WAREHOUSE_SESSION_SECRET'] as const;
const OPEN_API_KEYS = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'FEISHU_MAIN_SHEET_ID', 'FEISHU_CURRENT_INVENTORY_SHEET_ID'] as const;
const ROLE_KEYS = ['WAREHOUSE_ADMIN_USERS', 'WAREHOUSE_OPERATOR_USERS', 'WAREHOUSE_READ_ONLY_USERS'] as const;

export interface UatRuntimeConfig {
  mode: typeof UAT_MODE;
  version: string;
  oauthRedirectUri: string;
}

export interface RuntimeConfigStatus {
  readOnlyRelease: boolean;
  authConfigured: boolean;
  openApiConfigured: boolean;
  rolesConfigured: boolean;
  versionConfigured: boolean;
}

export class RuntimeConfigError extends Error {
  readonly code = 'RUNTIME_CONFIG_INVALID';
  constructor(readonly missingOrInvalid: readonly string[]) {
    super(`UAT runtime configuration is invalid: ${missingOrInvalid.join(', ')}`);
  }
}

export function inspectUatRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): RuntimeConfigStatus {
  const present = (key: string) => Boolean(env[key]?.trim());
  const sessionSecret = env.WAREHOUSE_SESSION_SECRET?.trim() ?? '';
  const redirect = safeUrl(env.FEISHU_OAUTH_REDIRECT_URI);
  return {
    readOnlyRelease: env.READ_ONLY_RELEASE === 'true',
    authConfigured: AUTH_KEYS.every(present) && sessionSecret.length >= 32 && redirect?.protocol === 'https:',
    openApiConfigured: env.FEISHU_READ_ADAPTER === 'openapi' && OPEN_API_KEYS.every(present),
    rolesConfigured: ROLE_KEYS.every(present),
    versionConfigured: present('APP_VERSION'),
  };
}

export function validateUatRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): UatRuntimeConfig {
  const invalid: string[] = [];
  const required = [...new Set([...AUTH_KEYS, ...OPEN_API_KEYS, ...ROLE_KEYS, 'APP_VERSION'])];
  for (const key of required) if (!env[key]?.trim()) invalid.push(key);
  if (env.FEISHU_READ_ADAPTER !== 'openapi') invalid.push('FEISHU_READ_ADAPTER=openapi');
  if (env.READ_ONLY_RELEASE !== 'true') invalid.push('READ_ONLY_RELEASE=true');
  if ((env.WAREHOUSE_SESSION_SECRET?.trim().length ?? 0) < 32) invalid.push('WAREHOUSE_SESSION_SECRET(minimum-length)');
  const redirect = safeUrl(env.FEISHU_OAUTH_REDIRECT_URI);
  if (!redirect || redirect.protocol !== 'https:') invalid.push('FEISHU_OAUTH_REDIRECT_URI(https)');
  if (invalid.length) throw new RuntimeConfigError([...new Set(invalid)]);
  assertReadOnlyRelease(env);
  return { mode: UAT_MODE, version: env.APP_VERSION!.trim(), oauthRedirectUri: redirect!.toString() };
}

function safeUrl(value: string | undefined): URL | undefined {
  try { return value?.trim() ? new URL(value) : undefined; } catch { return undefined; }
}
