import assert from 'node:assert/strict';
import test from 'node:test';
import { FeishuOpenApiClient, FeishuOpenApiError, tokenRefreshAt } from '../src/feishu/openApiClient.js';
import { FeishuOpenApiWarehouseSheetReader, GoogleSheetsGvizWarehouseSheetReader } from '../src/feishu/sheetReader.js';

test('tenant token is server-cached, refreshed before expiry, and never appears in errors', async () => {
  let tokenCalls = 0, readCalls = 0, now = 1_000_000;
  const fetchMock: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes('tenant_access_token')) {
      tokenCalls += 1;
      return Response.json({ code: 0, tenant_access_token: `private-token-${tokenCalls}`, expire: 600 });
    }
    readCalls += 1;
    if (readCalls === 3) return Response.json({ code: 999, msg: 'private-token-2 must not leak' });
    return Response.json({ code: 0, data: { ok: true } });
  };
  const client = new FeishuOpenApiClient({ appId: 'app', appSecret: 'top-secret' }, fetchMock, () => now);
  await client.get('/open-apis/test');
  await client.get('/open-apis/test');
  assert.equal(tokenCalls, 1);
  now += 301_000;
  await assert.rejects(() => client.get('/open-apis/test'), (error: unknown) => {
    assert(error instanceof FeishuOpenApiError);
    assert(!error.message.includes('private-token'));
    assert(!error.message.includes('top-secret'));
    return true;
  });
  assert.equal(tokenCalls, 2);
});

test('OpenAPI sheet reader preserves numeric values and produces the same typed table shape as local reads', async () => {
  const fetchMock: typeof fetch = async (input) => {
    const path = decodeURIComponent(new URL(String(input)).pathname);
    if (path.includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'private', expire: 7200 });
    if (path.endsWith('/sheets/query')) return Response.json({ code: 0, data: { sheets: [{ sheet_id: 'inv1', title: '当前库存', grid_properties: { row_count: 3, column_count: 3 } }] } });
    return Response.json({ code: 0, data: { valueRange: { values: [['SKU', 'Available Qty', 'Location'], ['00123', 2, 'R1'], ['', null, '']] } } });
  };
  const reader = new FeishuOpenApiWarehouseSheetReader('sheet-token', new FeishuOpenApiClient({ appId: 'app', appSecret: 'secret' }, fetchMock));
  const table = await reader.readTable({ sheetName: '当前库存' });
  assert.deepEqual(table.columns, ['SKU', 'Available Qty', 'Location']);
  assert.deepEqual(table.data, [['00123', 2, 'R1']]);
  assert.equal(table.dtypes['Available Qty'], 'number');
  assert.equal(table.dtypes.SKU, 'string');
});

test('Google Sheets GViz reader preserves numbers, leading-zero identifiers, quoted text, and bounded ranges', async () => {
  let requested = '';
  const fetchMock: typeof fetch = async (input) => {
    requested = String(input);
    return new Response('"SKU","Available Qty","Location","Remark"\n"00123","2","R1","line 1\nline 2"\n"","","",""');
  };
  const reader = new GoogleSheetsGvizWarehouseSheetReader('public-sheet', fetchMock);
  const table = await reader.readTable({ sheetName: '当前库存明细查询', range: 'A1:D3' });
  assert.deepEqual(table.columns, ['SKU', 'Available Qty', 'Location', 'Remark']);
  assert.deepEqual(table.data, [['00123', 2, 'R1', 'line 1\nline 2']]);
  assert.equal(table.dtypes['Available Qty'], 'number');
  assert.equal(table.dtypes.SKU, 'string');
  const url = new URL(requested);
  assert.equal(url.searchParams.get('sheet'), '当前库存明细查询');
  assert.equal(url.searchParams.get('range'), 'A1:D3');
});

test('token refresh boundary is strictly before expiry for long and short TTLs', () => {
  const acquiredAt = 10_000;
  for (const ttl of [7200, 600, 120, 30]) {
    const refreshAt = tokenRefreshAt(acquiredAt, ttl);
    assert(refreshAt > acquiredAt, `TTL ${ttl} must have a positive cache window`);
    assert(refreshAt < acquiredAt + ttl * 1000, `TTL ${ttl} must refresh before expiry`);
  }
});
