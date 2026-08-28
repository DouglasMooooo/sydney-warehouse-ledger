import assert from 'node:assert/strict';
import test from 'node:test';
import { runFeishuOpenApiReadDiagnostic } from '../src/uat/feishuOpenApiDiagnostic.js';

const env = {
  FEISHU_APP_ID: 'cli_aa0d0244d736dbe9',
  FEISHU_APP_SECRET: 'never-log-this-secret',
  FEISHU_READ_ADAPTER: 'openapi',
  FEISHU_SPREADSHEET_TOKEN: 'workbook-secret-token',
  FEISHU_MAIN_SHEET_ID: 'main-sheet',
  FEISHU_CURRENT_INVENTORY_SHEET_ID: 'baseline-sheet',
};

test('OpenAPI diagnostic performs independent read-only probes and redacts configuration values', async () => {
  const calls: Array<{ url: string; method?: string }> = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(init?.method ? { url, method: init.method } : { url });
    if (url.includes('tenant_access_token')) return json({ code: 0, tenant_access_token: 'tenant-token-must-not-appear' });
    if (url.includes('/sheets/query')) return json({ code: 0, data: { sheets: [
      { title: '主表 库存流水', sheet_id: 'main-sheet' }, { title: '当前库存明细查询', sheet_id: 'baseline-sheet' },
      { title: '库位维护', sheet_id: 'location-sheet' }, { title: '产品库存维护', sheet_id: 'product-sheet' },
    ] } });
    return json({ code: 0, data: { valueRange: { values: [[]] } } });
  };
  const entries = await runFeishuOpenApiReadDiagnostic(env, fetchImpl as typeof fetch);
  assert.equal(entries.every((entry) => entry.RESULT === 'PASS'), true);
  assert.equal(calls.length, 6);
  assert.equal(calls.every((call) => call.method !== 'PUT' && call.method !== 'POST' || call.url.includes('tenant_access_token')), true);
  const visible = JSON.stringify(entries);
  assert(!visible.includes(env.FEISHU_APP_SECRET));
  assert(!visible.includes(env.FEISHU_SPREADSHEET_TOKEN));
  assert(!visible.includes('tenant-token-must-not-appear'));
  assert(visible.includes('dbe9'));
});

test('OpenAPI diagnostic retains original Feishu failure metadata', async () => {
  const fetchImpl = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('tenant_access_token')) return json({ code: 0, tenant_access_token: 'token' });
    return json({ code: 99991663, msg: 'permission denied', request_id: 'req-123' }, 403, { 'x-tt-logid': 'log-456' });
  };
  const entries = await runFeishuOpenApiReadDiagnostic(env, fetchImpl as typeof fetch);
  assert.deepEqual(entries.map((entry) => entry.STEP), ['TENANT_TOKEN', 'SHEET_LIST']);
  assert.deepEqual(entries[1] && { status: entries[1].HTTP_STATUS, code: entries[1].FEISHU_CODE, msg: entries[1].FEISHU_MSG, requestId: entries[1].REQUEST_ID }, { status: 403, code: 99991663, msg: 'permission denied', requestId: 'log-456' });
});

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
