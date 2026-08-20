import type { WarehouseAuthContext, WarehouseRole } from './types.js';

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
