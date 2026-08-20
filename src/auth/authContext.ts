import type { WarehouseAuthContext, WarehouseRole } from './types.js';

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

/**
 * Local/test bootstrap only. Production deliberately has no fallback identity until a
 * server-side Feishu identity adapter is connected.
 */
export function resolveWarehouseAuthContext(
  runtime: 'development' | 'test' | 'production' = process.env.NODE_ENV === 'production'
    ? 'production'
    : process.env.NODE_ENV === 'test' ? 'test' : 'development',
): WarehouseAuthContext {
  if (runtime === 'production') throw new WarehouseAuthenticationError('Feishu identity adapter is not configured.');
  return createDevOnlyAuthContext(['WAREHOUSE_OPERATOR']);
}
