import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyCurrentInventoryBaseline } from '../src/application/currentInventoryBaselineVerifier.js';

const table = (formulas: Record<string, string[]>) => ({ name: '当前库存', range: 'A1:G3', columns: ['SKU', 'Model', 'Location', 'Available Qty', 'Stock Condition', 'SN', 'Display'], data: [], dtypes: {}, formulas });
test('frozen values in authority fields pass while presentation helper formulas are allowed', () => {
  assert.equal(verifyCurrentInventoryBaseline(table({ Display: ['=A2&"/"&B2'] }), 'EXPLICIT_BASELINE').valid, true);
});
test('formula in an authority field fails closed', () => {
  const result = verifyCurrentInventoryBaseline(table({ 'Available Qty': ['=SUM(A1:A2)'] }), 'PHYSICAL_SNAPSHOT');
  assert.equal(result.valid, false); assert.equal(result.code, 'CURRENT_INVENTORY_BASELINE_HAS_FORMULAS');
});
