import { cookies } from 'next/headers';
import { resolveWarehouseAuthContext } from './authContext.js';
import { requireWarehousePermission, type WarehousePermission } from './permissions.js';
import { sessionCookieName } from './session.js';
import type { WarehouseAuthContext } from './types.js';

export async function authenticateWarehousePage(permission: WarehousePermission) {
  const runtime = process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
  const store = await cookies();
  const value = store.get(sessionCookieName(runtime))?.value;
  const context = resolveWarehouseAuthContext({ ...(value ? { sessionValue: value } : {}), runtime });
  requireWarehousePermission(context, permission);
  return context;
}

export async function authenticateWarehouseSessionPage(): Promise<WarehouseAuthContext> {
  const runtime = process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
  const store = await cookies();
  const value = store.get(sessionCookieName(runtime))?.value;
  return resolveWarehouseAuthContext({ ...(value ? { sessionValue: value } : {}), runtime });
}
