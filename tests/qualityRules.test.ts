import assert from 'node:assert/strict';
import test from 'node:test';
import { scanRow } from '../src/quality/rules.js';

test('scanner reports prepared and formula issues without changing row', () => {
  const row = {
    row: 1653,
    cells: {
      C: { value: '备货' }, D: { value: 'SH1\n' }, E: {}, G: { value: '001' },
      K: { value: 1 }, L: {}, N: { value: 'Sydney' }, P: { value: '新机' },
      H: { value: 'Model' }, I: { value: '成品' }, O: { formula: '=1', value: '正常' },
      Q: { formula: '=1' }, R: { formula: '=1' }, S: { formula: '=1' }, T: { formula: '=1' },
      W: { formula: '=1', value: '正常' }, X: { formula: '=1' }, Y: { formula: '=1' },
      Z: { formula: '=1' }, AA: { formula: '=1' }, AB: { formula: '=1' }, AC: { formula: '=1' },
    },
  };
  const issues = scanRow(row, new Set());
  assert(issues.some((item) => item.code === 'HIDDEN_CHARACTER'));
  assert(issues.some((item) => item.code === 'PREPARED_WITHOUT_PICKUP_CODE'));
  assert(issues.some((item) => item.code === 'PREPARED_WITHOUT_SOURCE_LOCATION'));
  assert.equal(issues.filter((item) => item.code === 'FORMULA_MISSING').length, 2);
});
