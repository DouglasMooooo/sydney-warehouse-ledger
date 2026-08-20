import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeIdentityAllowed, createDevOnlyAuthContext } from '../src/auth/authContext.js';
import { hasWarehousePermission } from '../src/auth/permissions.js';

test('READ_ONLY is limited to dashboard, inventory, and task reads', () => {
  assert.equal(hasWarehousePermission(['READ_ONLY'], 'DASHBOARD_READ'), true);
  assert.equal(hasWarehousePermission(['READ_ONLY'], 'INVENTORY_READ'), true);
  assert.equal(hasWarehousePermission(['READ_ONLY'], 'TASK_READ'), true);
  assert.equal(hasWarehousePermission(['READ_ONLY'], 'WORK_ORDER_PREVIEW'), false);
  assert.equal(hasWarehousePermission(['READ_ONLY'], 'ADJUSTMENT_MANAGE'), false);
});

test('operator and admin policies describe future capabilities without enabling endpoints', () => {
  assert.equal(hasWarehousePermission(['WAREHOUSE_OPERATOR'], 'WORK_ORDER_PREVIEW'), true);
  assert.equal(hasWarehousePermission(['WAREHOUSE_OPERATOR'], 'MOVE_CONFIRM'), true);
  assert.equal(hasWarehousePermission(['WAREHOUSE_OPERATOR'], 'ADJUSTMENT_MANAGE'), false);
  assert.equal(hasWarehousePermission(['WAREHOUSE_ADMIN'], 'ADJUSTMENT_MANAGE'), true);
  assert.equal(hasWarehousePermission(['WAREHOUSE_ADMIN'], 'CONFIGURATION_MANAGE'), true);
});

test('DEV_ONLY identity is explicit and forbidden in production', () => {
  const context = createDevOnlyAuthContext(['WAREHOUSE_OPERATOR']);
  assert.equal(context.identitySource, 'DEV_ONLY');
  assert.doesNotThrow(() => assertRuntimeIdentityAllowed(context, 'development'));
  assert.throws(() => assertRuntimeIdentityAllowed(context, 'production'), /DEV_ONLY_IDENTITY_FORBIDDEN/);
});
