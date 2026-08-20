import type { WarehouseAuthContext, WarehouseRole } from './types.js';
import { readSessionToken, sessionCookieName } from './session.js';

export class WarehouseAuthenticationError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED';
}

/** Explicit local-only identity; it is not authentication and must never be accepted in production. */
export function createDevOnlyAuthContext(roles: WarehouseRole[] = ['READ_ONLY']): WarehouseAuthContext {
  return {
    identitySource: 'DEV_ONLY',
    user: { userId: 'DEV_ONLY_LOCAL_USER', displayName: 'DEV_ONLY', roles: [...roles] },
  };
}

export function assertRuntimeIdentityAllowed(
  context: WarehouseAuthContext,
  runtime: 'development' | 'test' | 'production',
): void {
  if (runtime === 'production' && context.identitySource === 'DEV_ONLY') {
    throw new Error('DEV_ONLY_IDENTITY_FORBIDDEN');
  }
}

export function resolveWarehouseAuthContext(
  options: {
    cookieHeader?: string | null;
    sessionValue?: string;
    runtime?: 'development' | 'test' | 'production';
    env?: Readonly<Record<string, string | undefined>>;
    now?: Date;
  } = {},
): WarehouseAuthContext {
  const env = options.env ?? process.env;
  const runtime = options.runtime ?? (process.env.NODE_ENV === 'production'
    ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development');
  const sessionValue = options.sessionValue ?? cookieValue(options.cookieHeader, sessionCookieName(runtime));
  if (sessionValue) {
    const secret = env.WAREHOUSE_SESSION_SECRET?.trim();
    if (!secret) throw new WarehouseAuthenticationError('Session verification is not configured.');
    const context = readSessionToken(sessionValue, secret, options.now);
    if (!context) throw new WarehouseAuthenticationError('Session is invalid or expired.');
    assertRuntimeIdentityAllowed(context, runtime);
    return context;
  }
  if (runtime !== 'production' && env.WAREHOUSE_DEV_AUTH === 'true') {
    return createDevOnlyAuthContext(['WAREHOUSE_OPERATOR']);
  }
  throw new WarehouseAuthenticationError('A valid Feishu session is required.');
}

function cookieValue(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
