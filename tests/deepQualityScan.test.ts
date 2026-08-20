import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenApiDeepQualitySource, runDeepQualityScan, type DeepQualitySource } from '../src/application/deepQualityScan.js';
import { FeishuOpenApiClient } from '../src/feishu/openApiClient.js';

test('deep scan executes the existing metadata rules and returns truthful timestamp/coverage', async () => {
  const cells: Record<string, any> = {
    A: { value: '2026-08-20', data_type: 'text' }, C: { value: '备货' }, D: { value: 'SH1\n' }, E: { value: 'P1' }, G: { value: 'SKU1' }, J: {}, K: { value: 1 }, L: { value: 'R1' }, P: { value: '新机' },
    H: { formula: '=1' }, I: { formula: '=1' }, O: { formula: '=1', value: '错误' }, Q: { formula: '=1' }, R: { formula: '=1' }, S: { formula: '=1' }, T: { formula: '=1' }, W: { formula: '=1', value: '#REF!' }, X: { formula: '=1' }, Y: { formula: '=1' }, Z: { formula: '=1' }, AA: { formula: '=1' }, AB: { formula: '=1' }, AC: {},
  };
  const source: DeepQualitySource = { async readLedgerRows() { return [{ row: 1653, cells }]; }, async readValidLocations() { return new Set(['R1']); } };
  const result = await runDeepQualityScan(source, new Date('2026-08-20T01:02:03Z'));
  assert.equal(result.scannedAt, '2026-08-20T01:02:03.000Z');
  for (const code of ['DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK']) assert(result.exceptions.some((item) => item.code === code), code);
  assert(result.ruleCoverage.every((rule) => rule.status === 'FULL'));
  assert(!JSON.stringify(result).includes('=1'));
});

test('OpenAPI deep coverage reports date/formula limitations and validation metadata as unavailable', () => {
  const source = new OpenApiDeepQualitySource('token', 'main', new FeishuOpenApiClient({ appId: 'app', appSecret: 'secret' }), 2);
  const coverage = Object.fromEntries(source.ruleCoverage().map((item) => [item.code, item.status]));
  assert.equal(coverage.DATE_STORED_AS_TEXT, 'PARTIAL');
  assert.equal(coverage.FORMULA_MISSING, 'PARTIAL');
  assert.equal(coverage.FORMULA_BROKEN, 'PARTIAL');
  assert.equal(coverage.VALIDATION_NOT_OK, 'UNAVAILABLE');
  assert.equal(coverage.HIDDEN_CHARACTER, 'FULL');
});

test('OpenAPI Formula render response is mapped only when it contains an actual formula', async () => {
  const fetchMock: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.includes('tenant_access_token')) return Response.json({ code: 0, tenant_access_token: 'private', expire: 7200 });
    const cells = Array(29).fill('');
    if (url.searchParams.get('valueRenderOption') === 'Formula') cells[7] = '=IF(A2="","",A2)';
    else { cells[0] = 45524; cells[2] = '备货'; cells[7] = '2024-08-20'; }
    return Response.json({ code: 0, data: { valueRange: { values: [cells] } } });
  };
  const source = new OpenApiDeepQualitySource('sheet', 'main', new FeishuOpenApiClient({ appId: 'app', appSecret: 'secret' }, fetchMock), 2);
  const rows = await source.readLedgerRows();
  assert.equal(rows[0]?.cells.H?.formula, '=IF(A2="","",A2)');
  assert.equal(rows[0]?.cells.A?.data_type, 'number');
  assert.equal(rows[0]?.cells.I?.formula, undefined);
});
