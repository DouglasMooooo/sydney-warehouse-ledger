import assert from 'node:assert/strict';
import test from 'node:test';
import { FeishuOpenApiClient, FeishuOpenApiError } from '../src/feishu/openApiClient.js';
import { FeishuOpenApiWarehouseSheetReader } from '../src/feishu/sheetReader.js';

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
