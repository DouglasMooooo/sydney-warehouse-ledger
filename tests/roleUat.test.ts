import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWarehouseAuthContext } from '../src/auth/authContext.js';
import { requireWarehousePermission } from '../src/auth/permissions.js';
import { createSessionToken } from '../src/auth/session.js';

const secret = 'u'.repeat(32);
const now = new Date('2026-08-21T00:00:00Z');

test('mock UAT role matrix is enforced by server session and permission boundaries', () => {
  const session = (roles: Array<'READ_ONLY' | 'WAREHOUSE_OPERATOR'>) => createSessionToken({ identitySource: 'FEISHU', user: { userId: 'private-test-user', roles } }, secret, now);
  const resolve = (token?: string) => resolveWarehouseAuthContext({ ...(token ? { sessionValue: token } : {}), runtime: 'production', env: { WAREHOUSE_SESSION_SECRET: secret }, now: new Date('2026-08-21T00:10:00Z') });

  const reader = resolve(session(['READ_ONLY']));
  for (const permission of ['DASHBOARD_READ', 'TASK_READ', 'INVENTORY_READ'] as const) assert.doesNotThrow(() => requireWarehousePermission(reader, permission));
  assert.throws(() => requireWarehousePermission(reader, 'WORK_ORDER_PREVIEW'), /Permission required/);

  const operator = resolve(session(['WAREHOUSE_OPERATOR']));
  assert.doesNotThrow(() => requireWarehousePermission(operator, 'WORK_ORDER_PREVIEW'));

  const unlisted = resolve(session([]));
  assert.throws(() => requireWarehousePermission(unlisted, 'DASHBOARD_READ'), /Permission required/);
  assert.throws(() => resolve(), /valid Feishu session/);
});
