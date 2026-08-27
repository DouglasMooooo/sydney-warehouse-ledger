import assert from 'node:assert/strict';
import test from 'node:test';
import { runFeishuConfigCheck, type FeishuUatFailureCode } from '../src/uat/feishuConfigCheck.js';

const env = {
  FEISHU_READ_ADAPTER: 'openapi', FEISHU_APP_ID: 'private-app-id', FEISHU_APP_SECRET: 'private-app-secret', FEISHU_SPREADSHEET_TOKEN: 'private-sheet-token',
  FEISHU_MAIN_SHEET_ID: 'private-main-sheet', FEISHU_CURRENT_INVENTORY_SHEET_ID: 'private-inventory-sheet', FEISHU_OAUTH_REDIRECT_URI: 'https://uat.example.test/api/auth/feishu/callback',
  WAREHOUSE_SESSION_SECRET: 'x'.repeat(32), WAREHOUSE_ADMIN_USERS: 'private-admin', WAREHOUSE_OPERATOR_USERS: 'private-operator', WAREHOUSE_READ_ONLY_USERS: 'private-reader',
  READ_ONLY_RELEASE: 'true', APP_VERSION: 'test-version',
  CURRENT_INVENTORY_AUTHORITY_MODE: 'EXPLICIT_BASELINE', CURRENT_INVENTORY_BASELINE_EFFECTIVE_DATE: '2026-08-26',
};

test('Feishu config checker proves token, metadata, document access, and tiny range without leaking values', async () => {
  const result = await runFeishuConfigCheck(env, sequenced([
    ok({ tenant_access_token: 'private-tenant-token', expire: 7200 }), ok({ sheets: [{}] }), ok({ valueRange: { values: [['private-cell-value']] } }),
  ]));
  assert.equal(result.ok, true);
  assert(result.steps.every((step) => step.status === 'PASS'));
  const serialized = JSON.stringify(result);
  const privateValues = Object.values(env).filter((value) => value.startsWith('private') || value.length >= 32);
  for (const secret of privateValues.concat(['private-tenant-token', 'private-cell-value'])) assert(!serialized.includes(secret));
});

test('Feishu config checker distinguishes scope, document, not-found, range, and token failures', async () => {
  await expectFailure(sequenced([Response.json({ code: 10003, msg: 'bad credentials' }, { status: 400 })]), 'FEISHU_TOKEN_FAILED');
  await expectFailure(sequenced([ok({ tenant_access_token: 'token', expire: 7200 }), Response.json({ code: 99991672, msg: 'scope required' }, { status: 403 })]), 'FEISHU_SCOPE_MISSING');
  await expectFailure(sequenced([ok({ tenant_access_token: 'token', expire: 7200 }), ok({ sheets: [{}] }), Response.json({ code: 1310213, msg: 'Permission Fail' }, { status: 403 })]), 'FEISHU_DOCUMENT_ACCESS_DENIED');
  await expectFailure(sequenced([ok({ tenant_access_token: 'token', expire: 7200 }), Response.json({ code: 1310212, msg: 'spreadsheet not found' }, { status: 404 })]), 'FEISHU_SPREADSHEET_NOT_FOUND');
  await expectFailure(sequenced([ok({ tenant_access_token: 'token', expire: 7200 }), ok({ sheets: [{}] }), Response.json({ code: 50001, msg: 'temporary read failure' }, { status: 500 })]), 'FEISHU_RANGE_READ_FAILED');
});

test('Feishu config checker stops before network when runtime config is incomplete', async () => {
  let called = false;
  const result = await runFeishuConfigCheck({}, async () => { called = true; return ok({}); });
  assert.equal(called, false);
  assert.equal(result.steps[0]?.failureCode, 'UAT_RUNTIME_CONFIG_INVALID');
});

test('Feishu config checker reports controlled-write UAT without exposing credentials', async () => {
  const result = await runFeishuConfigCheck({ ...env, READ_ONLY_RELEASE: 'false', CONTROLLED_WRITE_UAT: 'true' }, sequenced([
    ok({ tenant_access_token: 'private-tenant-token' }), ok({ sheets: [{}] }), ok({ valueRange: { values: [['header']] } }),
  ]));
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'CONTROLLED_WRITE_UAT');
});

async function expectFailure(fetchImpl: typeof fetch, code: FeishuUatFailureCode) {
  const result = await runFeishuConfigCheck(env, fetchImpl);
  assert.equal(result.ok, false);
  assert(result.steps.some((step) => step.failureCode === code), JSON.stringify(result));
}

function ok(data: Record<string, unknown>): Response { return Response.json({ code: 0, data, ...data }); }
function sequenced(responses: Response[]): typeof fetch {
  let index = 0;
  return async () => responses[index++] ?? Response.json({ code: 50000 }, { status: 500 });
}
