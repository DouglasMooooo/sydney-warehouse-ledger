import type { WarehouseRole } from './types.js';
import type { WarehouseAuthContext } from './types.js';

export const WAREHOUSE_PERMISSIONS = [
  'DASHBOARD_READ', 'INVENTORY_READ', 'TASK_READ',
  'WORK_ORDER_PREVIEW', 'WORK_ORDER_CONFIRM',
  'RETURN_PREVIEW', 'RETURN_CONFIRM',
  'MOVE_PREVIEW', 'MOVE_CONFIRM', 'LABEL_GENERATE',
  'ADJUSTMENT_MANAGE', 'EXCEPTION_RESOLVE', 'CONFIGURATION_MANAGE',
] as const;

export type WarehousePermission = (typeof WAREHOUSE_PERMISSIONS)[number];

const readOnly: readonly WarehousePermission[] = ['DASHBOARD_READ', 'INVENTORY_READ', 'TASK_READ'];
const operator: readonly WarehousePermission[] = [
  ...readOnly,
  'WORK_ORDER_PREVIEW', 'WORK_ORDER_CONFIRM',
  'RETURN_PREVIEW', 'RETURN_CONFIRM',
  'MOVE_PREVIEW', 'MOVE_CONFIRM', 'LABEL_GENERATE',
];

export const ROLE_PERMISSIONS: Readonly<Record<WarehouseRole, readonly WarehousePermission[]>> = Object.freeze({
  READ_ONLY: readOnly,
  WAREHOUSE_OPERATOR: operator,
  WAREHOUSE_ADMIN: [...operator, 'ADJUSTMENT_MANAGE', 'EXCEPTION_RESOLVE', 'CONFIGURATION_MANAGE'],
});

export function hasWarehousePermission(roles: readonly WarehouseRole[], permission: WarehousePermission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}

export class WarehouseAuthorizationError extends Error {
  readonly code = 'PERMISSION_DENIED';
  constructor(readonly permission: WarehousePermission) {
    super(`Permission required: ${permission}`);
  }
}

export function requireWarehousePermission(
  context: WarehouseAuthContext,
  permission: WarehousePermission,
): void {
  if (!hasWarehousePermission(context.user.roles, permission)) {
    throw new WarehouseAuthorizationError(permission);
  }
}
