import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { WarehouseAuthorizationError, requireWarehousePermission } from '../src/auth/permissions.js';
import { resolveWarehouseAuthContext } from '../src/auth/authContext.js';
import { logOperationalEvent } from '../src/observability/requestLog.js';
import { assertBusinessMutationAllowed, ReadOnlyReleaseError } from '../src/safety/readOnlyRelease.js';

test('READ_ONLY_RELEASE blocks every future business mutation boundary', () => {
  assert.throws(() => assertBusinessMutationAllowed({ READ_ONLY_RELEASE: 'true' }), ReadOnlyReleaseError);
  assert.doesNotThrow(() => assertBusinessMutationAllowed({ READ_ONLY_RELEASE: 'false' }));
  for (const forbidden of [
    'app/api/warehouse/work-orders/confirm/route.ts',
    'app/api/warehouse/returns/confirm/route.ts',
    'app/api/warehouse/moves/confirm/route.ts',
    'app/api/warehouse/adjustments/route.ts',
  ]) assert.equal(existsSync(forbidden), false, `${forbidden} must remain absent`);
});

test('missing identity and insufficient role fail at the server permission boundary', () => {
  assert.throws(() => resolveWarehouseAuthContext({ runtime: 'production', env: {} }), /valid Feishu session/);
  assert.throws(() => requireWarehousePermission({ identitySource: 'FEISHU', user: { userId: 'u1', roles: [] } }, 'TASK_READ'), WarehouseAuthorizationError);
});

test('operational logs contain only the approved low-cardinality fields', () => {
  let line = '';
  logOperationalEvent({ requestId: 'req-1', route: '/api/test', outcome: 'failure', durationMs: 7, errorCode: 'DENIED', role: 'READ_ONLY' }, (value) => { line = value; });
  assert.deepEqual(Object.keys(JSON.parse(line)).sort(), ['durationMs', 'errorCode', 'outcome', 'requestId', 'role', 'route'].sort());
  for (const forbidden of ['userId', 'openId', 'token', 'secret', 'spreadsheet', 'customer', 'serialNumber']) assert(!line.includes(forbidden));
});

test('client modules cannot import server credentials, writers, CLI, or child_process', () => {
  const clientFiles = allFiles('app').filter((path) => path.endsWith('.tsx') || path.endsWith('.ts'))
    .filter((path) => readFileSync(path, 'utf8').includes("'use client'"));
  const forbidden = ['feishuIdentity', 'openApiClient', 'runtimeConfig', 'session', '/write', 'feishu/client', 'child_process', 'node:child_process'];
  for (const path of clientFiles) {
    const source = readFileSync(path, 'utf8');
    for (const value of forbidden) assert(!source.includes(value), `${path} must not reference ${value}`);
  }
});

test('credentials are server-only and health/API source exposes no token or sheet identifier DTO', () => {
  const env = readFileSync('.env.example', 'utf8');
  assert(!/NEXT_PUBLIC_.*(?:SECRET|TOKEN|APP_ID|SESSION)/i.test(env));
  const health = readFileSync('app/api/health/route.ts', 'utf8');
  // Health may test whether a server-only variable exists, but its response must not name or return credentials/identifiers.
  for (const forbidden of ['FEISHU_SPREADSHEET_TOKEN', 'tenant_access_token', 'sheetId', 'appSecret:', 'token:']) assert(!health.includes(forbidden));
  for (const path of ['app/api/warehouse/dashboard/route.ts', 'app/api/warehouse/tasks/route.ts', 'app/api/warehouse/layout/route.ts', 'app/api/warehouse/exceptions/route.ts']) {
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['FEISHU_APP_SECRET', 'tenant_access_token', 'spreadsheetToken']) assert(!source.includes(forbidden));
  }
});

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}
