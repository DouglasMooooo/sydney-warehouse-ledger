import assert from 'node:assert/strict';
import test from 'node:test';
import { getReadinessSnapshot } from '../src/application/readinessService.js';

const env = {
  FEISHU_READ_ADAPTER: 'openapi', FEISHU_APP_ID: 'app-private', FEISHU_APP_SECRET: 'secret-private', FEISHU_SPREADSHEET_TOKEN: 'sheet-private',
  FEISHU_MAIN_SHEET_ID: 'main-private', FEISHU_CURRENT_INVENTORY_SHEET_ID: 'inventory-private', FEISHU_OAUTH_REDIRECT_URI: 'https://uat.example.test/api/auth/feishu/callback',
  WAREHOUSE_SESSION_SECRET: 'x'.repeat(32), WAREHOUSE_ADMIN_USERS: 'a', WAREHOUSE_OPERATOR_USERS: 'o', WAREHOUSE_READ_ONLY_USERS: 'r', READ_ONLY_RELEASE: 'true', APP_VERSION: 'v1',
};

test('readiness distinguishes configuration from real spreadsheet readability', async () => {
  const ready = await getReadinessSnapshot(env, async () => true, async () => true);
  assert.deepEqual(ready, { ok: true, mode: 'READ_ONLY_UAT', version: 'v1', services: { authConfig: 'ok', openApiConfig: 'ok', ledgerRead: 'ok', ledgerSchema: 'ok', operationalWrite: 'unavailable' } });
  const degraded = await getReadinessSnapshot(env, async () => false, async () => true);
  assert.equal(degraded.ok, false);
  assert.equal(degraded.services.ledgerRead, 'unavailable');
  const serialized = JSON.stringify(degraded);
  for (const secret of ['app-private', 'secret-private', 'sheet-private', 'main-private', 'inventory-private']) assert(!serialized.includes(secret));
});

test('readiness does not attempt ledger access when read-only config is unsafe', async () => {
  let called = false;
  const result = await getReadinessSnapshot({ ...env, READ_ONLY_RELEASE: 'false' }, async () => { called = true; return true; }, async () => true);
  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.services.openApiConfig, 'unavailable');
});
