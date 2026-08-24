import type { WarehouseRole } from './types.js';

export function rolesForFeishuUser(openId: string, env: Readonly<Record<string, string | undefined>> = process.env): WarehouseRole[] {
  return rolesForFeishuIdentities([openId], env);
}

export function rolesForFeishuIdentities(ids: readonly string[], env: Readonly<Record<string, string | undefined>> = process.env): WarehouseRole[] {
  if (ids.some((id) => configuredUsers(env.WAREHOUSE_ADMIN_USERS).has(id))) return ['WAREHOUSE_ADMIN'];
  if (ids.some((id) => configuredUsers(env.WAREHOUSE_OPERATOR_USERS).has(id))) return ['WAREHOUSE_OPERATOR'];
  if (ids.some((id) => configuredUsers(env.WAREHOUSE_READ_ONLY_USERS).has(id))) return ['READ_ONLY'];
  return [];
}

function configuredUsers(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
}
