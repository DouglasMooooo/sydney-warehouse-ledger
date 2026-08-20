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
test('Prepared requires Outbound Date to remain blank', () => {
  const result = validateLedgerInput({
    action: '备货', date: new Date(), outboundDate: new Date(), shNo: 'SH1',
    pickupCode: 'SYD-00315', sku: '001', qty: 1, fromLocation: 'R1',
    erpWarehouse: 'Sydney', stockCondition: '新机',
  });
  assert(result.errors.some((error) => error.code === 'PREPARED_OUTBOUND_DATE_MUST_BE_BLANK'));
});
test('serialized decimal quantity is rejected', () => {
  const result = validateLedgerInput({ action: '退回维修', date: new Date(), sn: 'SN1', qty: 1.5, toLocation: 'RETURN-01', stockCondition: '待修' });
  assert(result.errors.some((error) => error.code === 'SERIALIZED_QTY_MUST_BE_ONE'));
});
test('Return to Repair rejects any condition other than 待修', () => {
  const result = validateLedgerInput({
    action: '退回维修', date: new Date(), sn: 'SN1', qty: 1,
    toLocation: 'REPAIR-01', stockCondition: '新机',
  });
  assert(result.errors.some((error) => error.code === 'RETURN_REQUIRES_PENDING_REPAIR'));
});

test('Move requires trusted source condition and cannot change it', () => {
  const missingSource = validateLedgerInput({
    action: '移库', date: new Date(), sn: 'SN1', qty: 1,
    fromLocation: 'R1', toLocation: 'R2', stockCondition: '新机',
  });
  assert(missingSource.errors.some((error) => error.code === 'MOVE_SOURCE_CONDITION_REQUIRED'));
  const changed = validateLedgerInput({
    action: '移库', date: new Date(), sn: 'SN1', qty: 1,
    fromLocation: 'R1', toLocation: 'R2', sourceStockCondition: '新机', stockCondition: '维修良品',
  });
  assert(changed.errors.some((error) => error.code === 'MOVE_CANNOT_CHANGE_STOCK_CONDITION'));
});

for (const action of ['期初库存', '入库'] as const) {
  test(`${action} requires date, qty, target location, and stock condition`, () => {
    const result = validateLedgerInput({ action });
    assert.deepEqual(new Set(result.errors.map((error) => error.code)), new Set([
      'MISSING_DATE', 'INVALID_QTY', 'MISSING_TARGET_LOCATION', 'INVALID_STOCK_CONDITION',
    ]));
    assert.equal(validateLedgerInput({
      action, date: new Date(), qty: 1, toLocation: 'R1-1-1-L', stockCondition: '新机',
    }).ok, true);
  });
}

for (const action of ['移库', '库存调增', '库存调减'] as const) {
  test(`${action} requires date`, () => {
    const base = action === '移库'
      ? { action, qty: 1, fromLocation: 'R1', toLocation: 'R2', stockCondition: '新机' as const }
      : action === '库存调增'
        ? { action, qty: 1, toLocation: 'R2', stockCondition: '新机' as const }
        : { action, qty: 1, fromLocation: 'R1', stockCondition: '新机' as const };
    const result = validateLedgerInput(base);
    assert(result.errors.some((error) => error.code === 'MISSING_DATE'));
  });
}

test('Outbound keeps strict normal work-order validation', () => {
  const result = validateLedgerInput({ action: '出库', date: new Date(), qty: 3, stockCondition: '新机' });
  const codes = new Set(result.errors.map((error) => error.code));
  for (const required of [
    'MISSING_SH', 'PREPARED_WITHOUT_PICKUP_CODE', 'MISSING_SKU',
    'PREPARED_WITHOUT_SOURCE_LOCATION', 'MISSING_ERP_WAREHOUSE',
    'MISSING_OUTBOUND_DATE', 'PRODUCT_OUTBOUND_WITHOUT_SN',
  ]) assert(codes.has(required), `missing strict outbound error ${required}`);
});
