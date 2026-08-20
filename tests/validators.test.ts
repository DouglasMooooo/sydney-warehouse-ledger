import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAction, normalizeStockCondition } from '../src/ledger/normalize.js';
import { validateLedgerInput } from '../src/ledger/validators.js';

test('controlled action accepted and arbitrary action rejected', () => {
  assert.equal(normalizeAction('备货'), '备货');
  assert.throws(() => normalizeAction('随便写'));
});
test('stock condition accepted and arbitrary condition rejected', () => {
  assert.equal(normalizeStockCondition('待修'), '待修');
  assert.throws(() => normalizeStockCondition('未知'));
});
test('Return to Repair allows missing SKU but requires SN', () => {
  const valid = validateLedgerInput({ action: '退回维修', date: new Date(), sn: 'SN1', qty: 1, toLocation: 'RETURN-01', stockCondition: '待修' });
  assert.equal(valid.ok, true);
  const invalid = validateLedgerInput({ action: '退回维修', date: new Date(), qty: 1, toLocation: 'RETURN-01', stockCondition: '待修' });
  assert(invalid.errors.some((error) => error.code === 'MISSING_SN'));
});
test('Prepared missing source location is rejected', () => {
  const result = validateLedgerInput({ action: '备货', date: new Date(), shNo: 'SH1', pickupCode: 'SYD-00315', sku: '001', qty: 1, erpWarehouse: 'Sydney', stockCondition: '新机' });
  assert(result.errors.some((error) => error.code === 'PREPARED_WITHOUT_SOURCE_LOCATION'));
});
test('serialized decimal quantity is rejected', () => {
  const result = validateLedgerInput({ action: '退回维修', date: new Date(), sn: 'SN1', qty: 1.5, toLocation: 'RETURN-01', stockCondition: '待修' });
  assert(result.errors.some((error) => error.code === 'SERIALIZED_QTY_MUST_BE_ONE'));
});
