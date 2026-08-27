import { assertBusinessMutationAllowed, assertReadOnlyRelease, isControlledWriteUat } from '../safety/readOnlyRelease.js';

export const UAT_MODE = 'READ_ONLY_UAT' as const;
export const CONTROLLED_WRITE_UAT_MODE = 'CONTROLLED_WRITE_UAT' as const;

const AUTH_KEYS = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_OAUTH_REDIRECT_URI', 'WAREHOUSE_SESSION_SECRET'] as const;
const OPEN_API_KEYS = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'FEISHU_MAIN_SHEET_ID', 'FEISHU_CURRENT_INVENTORY_SHEET_ID'] as const;
const REQUIRED_ROLE_KEYS = ['WAREHOUSE_OPERATOR_USERS', 'WAREHOUSE_READ_ONLY_USERS'] as const;
const OPTIONAL_ROLE_KEYS = ['WAREHOUSE_ADMIN_USERS'] as const;
const INVENTORY_AUTHORITY_MODES = ['PHYSICAL_SNAPSHOT', 'EXPLICIT_BASELINE'] as const;

export interface UatRuntimeConfig {
  mode: typeof UAT_MODE | typeof CONTROLLED_WRITE_UAT_MODE;
  version: string;
  oauthRedirectUri: string;
}

export interface RuntimeConfigStatus {
  readOnlyRelease: boolean;
  authConfigured: boolean;
  openApiConfigured: boolean;
  rolesConfigured: boolean;
  versionConfigured: boolean;
  currentInventoryAuthorityConfigured: boolean;
}

export class RuntimeConfigError extends Error {
  readonly code = 'RUNTIME_CONFIG_INVALID';
  constructor(readonly missingOrInvalid: readonly string[]) {
    super(`UAT runtime configuration is invalid: ${missingOrInvalid.join(', ')}`);
  }
}

export function inspectUatRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): RuntimeConfigStatus {
  const present = (key: string) => Boolean(env[key]?.trim());
  const configured = (key: string) => Object.prototype.hasOwnProperty.call(env, key);
  const sessionSecret = env.WAREHOUSE_SESSION_SECRET?.trim() ?? '';
  const redirect = safeUrl(env.FEISHU_OAUTH_REDIRECT_URI);
  return {
    readOnlyRelease: env.READ_ONLY_RELEASE === 'true',
    authConfigured: AUTH_KEYS.every(present) && sessionSecret.length >= 32 && redirect?.protocol === 'https:',
    openApiConfigured: env.FEISHU_READ_ADAPTER === 'openapi' && OPEN_API_KEYS.every(present),
    rolesConfigured: OPTIONAL_ROLE_KEYS.every(configured) && REQUIRED_ROLE_KEYS.every(present),
    versionConfigured: present('APP_VERSION'),
    currentInventoryAuthorityConfigured: INVENTORY_AUTHORITY_MODES.includes(env.CURRENT_INVENTORY_AUTHORITY_MODE as typeof INVENTORY_AUTHORITY_MODES[number]) && /^\d{4}-\d{2}-\d{2}$/.test(env.CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE?.trim() ?? ''),
  };
}

export function validateUatRuntimeConfig(env: Readonly<Record<string, string | undefined>> = process.env): UatRuntimeConfig {
  const invalid: string[] = [];
  const required = [...new Set([...AUTH_KEYS, ...OPEN_API_KEYS, ...REQUIRED_ROLE_KEYS, 'APP_VERSION'])];
  for (const key of required) if (!env[key]?.trim()) invalid.push(key);
  for (const key of OPTIONAL_ROLE_KEYS) if (!Object.prototype.hasOwnProperty.call(env, key)) invalid.push(`${key}(config-key)`);
  if (env.FEISHU_READ_ADAPTER !== 'openapi') invalid.push('FEISHU_READ_ADAPTER=openapi');
  if (!INVENTORY_AUTHORITY_MODES.includes(env.CURRENT_INVENTORY_AUTHORITY_MODE as typeof INVENTORY_AUTHORITY_MODES[number])) invalid.push('CURRENT_INVENTORY_AUTHORITY_MODE=PHYSICAL_SNAPSHOT or EXPLICIT_BASELINE');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(env.CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE?.trim() ?? '')) invalid.push('CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE=yyyy-mm-dd');
  const readOnly = env.READ_ONLY_RELEASE === 'true';
  const controlledWrite = isControlledWriteUat(env);
  if (!readOnly && !controlledWrite) invalid.push('READ_ONLY_RELEASE=true or CONTROLLED_WRITE_UAT=true');
  if ((env.WAREHOUSE_SESSION_SECRET?.trim().length ?? 0) < 32) invalid.push('WAREHOUSE_SESSION_SECRET(minimum-length)');
  const redirect = safeUrl(env.FEISHU_OAUTH_REDIRECT_URI);
  if (!redirect || redirect.protocol !== 'https:') invalid.push('FEISHU_OAUTH_REDIRECT_URI(https)');
  if (invalid.length) throw new RuntimeConfigError([...new Set(invalid)]);
  if (controlledWrite) assertBusinessMutationAllowed(env); else assertReadOnlyRelease(env);
  return { mode: controlledWrite ? CONTROLLED_WRITE_UAT_MODE : UAT_MODE, version: env.APP_VERSION!.trim(), oauthRedirectUri: redirect!.toString() };
}

function safeUrl(value: string | undefined): URL | undefined {
  try { return value?.trim() ? new URL(value) : undefined; } catch { return undefined; }
}
