import type { WarehouseRole } from './types.js';

export function rolesForFeishuUser(openId: string, env: Readonly<Record<string, string | undefined>> = process.env): WarehouseRole[] {
  if (configuredUsers(env.WAREHOUSE_ADMIN_USERS).has(openId)) return ['WAREHOUSE_ADMIN'];
  if (configuredUsers(env.WAREHOUSE_OPERATOR_USERS).has(openId)) return ['WAREHOUSE_OPERATOR'];
  if (configuredUsers(env.WAREHOUSE_READ_ONLY_USERS).has(openId)) return ['READ_ONLY'];
  return [];
}

function configuredUsers(value: string | undefined): Set<string> {
  return new Set((value ?? '').split(',').map((item) => item.trim()).filter(Boolean));
}
