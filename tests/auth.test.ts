import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRuntimeIdentityAllowed, createDevOnlyAuthContext, resolveWarehouseAuthContext } from '../src/auth/authContext.js';
import { hasWarehousePermission, requireWarehousePermission } from '../src/auth/permissions.js';
import { rolesForFeishuIdentities, rolesForFeishuUser } from '../src/auth/roleMapping.js';
import { createSessionToken, readSessionToken } from '../src/auth/session.js';

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
  assert.throws(() => resolveWarehouseAuthContext({ runtime: 'production', env: {} }), /valid Feishu session/);
});

test('role assignment is server configured, unknown users fail closed, and precedence is admin then operator', () => {
  const env = { WAREHOUSE_ADMIN_USERS: 'ou_a', WAREHOUSE_OPERATOR_USERS: 'ou_a,ou_b', WAREHOUSE_READ_ONLY_USERS: 'ou_a,ou_b,ou_c' };
  assert.deepEqual(rolesForFeishuUser('ou_a', env), ['WAREHOUSE_ADMIN']);
  assert.deepEqual(rolesForFeishuUser('ou_b', env), ['WAREHOUSE_OPERATOR']);
  assert.deepEqual(rolesForFeishuUser('ou_c', env), ['READ_ONLY']);
  assert.deepEqual(rolesForFeishuUser('ou_unknown', env), []);
  assert.deepEqual(rolesForFeishuIdentities(['ou_other_app', 'ou_a'], env), ['WAREHOUSE_ADMIN']);
});

test('signed short-lived session rejects tampering/expiry and authorizes an operator preview', () => {
  const secret = 'x'.repeat(32);
  const now = new Date('2026-08-20T00:00:00Z');
  const token = createSessionToken({ identitySource: 'FEISHU', user: { userId: 'ou_operator', roles: ['WAREHOUSE_OPERATOR'] } }, secret, now);
  assert.equal(readSessionToken(token, secret, new Date('2026-08-20T00:10:00Z'))?.user.userId, 'ou_operator');
  assert.equal(readSessionToken(`${token}x`, secret, now), undefined);
  assert.equal(readSessionToken(token, secret, new Date('2026-08-20T00:31:00Z')), undefined);
  const resolved = resolveWarehouseAuthContext({ sessionValue: token, runtime: 'production', env: { WAREHOUSE_SESSION_SECRET: secret }, now: new Date('2026-08-20T00:10:00Z') });
  assert.doesNotThrow(() => requireWarehousePermission(resolved, 'WORK_ORDER_PREVIEW'));
  assert.throws(() => resolveWarehouseAuthContext({ runtime: 'production', env: {} }));
});

test('server boundary enforces permissions, not only UI visibility', () => {
  assert.throws(() => requireWarehousePermission(createDevOnlyAuthContext(['READ_ONLY']), 'WORK_ORDER_PREVIEW'), /Permission required/);
  assert.doesNotThrow(() => requireWarehousePermission(createDevOnlyAuthContext(['WAREHOUSE_OPERATOR']), 'WORK_ORDER_PREVIEW'));
});
