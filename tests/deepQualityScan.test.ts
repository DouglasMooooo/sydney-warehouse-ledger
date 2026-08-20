import assert from 'node:assert/strict';
import test from 'node:test';
import { runDeepQualityScan, type DeepQualitySource } from '../src/application/deepQualityScan.js';

test('deep scan executes the existing metadata rules and returns truthful timestamp/coverage', async () => {
  const cells: Record<string, any> = {
    A: { value: '2026-08-20', data_type: 'text' }, C: { value: '备货' }, D: { value: 'SH1\n' }, E: { value: 'P1' }, G: { value: 'SKU1' }, J: {}, K: { value: 1 }, L: { value: 'R1' }, P: { value: '新机' },
    H: { formula: '=1' }, I: { formula: '=1' }, O: { formula: '=1', value: '错误' }, Q: { formula: '=1' }, R: { formula: '=1' }, S: { formula: '=1' }, T: { formula: '=1' }, W: { formula: '=1', value: '#REF!' }, X: { formula: '=1' }, Y: { formula: '=1' }, Z: { formula: '=1' }, AA: { formula: '=1' }, AB: { formula: '=1' }, AC: {},
  };
  const source: DeepQualitySource = { async readLedgerRows() { return [{ row: 1653, cells }]; }, async readValidLocations() { return new Set(['R1']); } };
  const result = await runDeepQualityScan(source, new Date('2026-08-20T01:02:03Z'));
  assert.equal(result.scannedAt, '2026-08-20T01:02:03.000Z');
  for (const code of ['DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK']) assert(result.exceptions.some((item) => item.code === code), code);
  assert(result.ruleCoverage.every((rule) => rule.executed));
  assert(!JSON.stringify(result).includes('=1'));
});
