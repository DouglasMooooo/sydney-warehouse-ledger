import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAwaitingPickupTasks, type DashboardLedgerActivity } from '../src/application/dashboardMetrics.js';
import { parseSourceNumber } from '../src/feishu/sourceValues.js';
import { parseInventoryRecords } from '../src/feishu/warehouseReadAdapter.js';

const row = (input: Partial<DashboardLedgerActivity>): DashboardLedgerActivity => ({
  action: '备货', sh: 'SH-1', pickupCode: 'SYD-00001', sku: 'SKU-1', qty: 1, outboundDate: '', ...input,
});

test('Prepared only is one awaiting-pickup task', () => {
  assert.equal(deriveAwaitingPickupTasks([row({})]), 1);
});

test('later matching Outbound closes the awaiting-pickup task', () => {
  assert.equal(deriveAwaitingPickupTasks([row({}), row({ action: '出库' })]), 0);
});

test('multiple SKU lines with one Pickup Code count as one task until all are outbound', () => {
  const rows = [
    row({ sku: 'SKU-1' }), row({ sku: 'SKU-2' }),
    row({ action: '出库', sku: 'SKU-1' }),
  ];
  assert.equal(deriveAwaitingPickupTasks(rows), 1);
  rows.push(row({ action: '出库', sku: 'SKU-2' }));
  assert.equal(deriveAwaitingPickupTasks(rows), 0);
});

test('source numeric parser distinguishes zero, missing, and malformed values', () => {
  assert.deepEqual(parseSourceNumber(0), { kind: 'valid', value: 0 });
  assert.deepEqual(parseSourceNumber(undefined), { kind: 'missing' });
  assert.deepEqual(parseSourceNumber('2'), { kind: 'invalid', raw: '2' });
  assert.deepEqual(parseSourceNumber('bad'), { kind: 'invalid', raw: 'bad' });
});

test('malformed inventory quantities are excluded and reported, not coerced to zero', () => {
  const parsed = parseInventoryRecords({
    name: 'inventory', range: 'A1:F4',
    columns: ['SKU', 'Model', 'Location', 'Container', 'Available Qty', 'Stock Condition'],
    data: [
      ['SKU-1', 'M1', 'R1', '', 0, '新机'],
      ['SKU-2', 'M2', 'R2', '', '3', '新机'],
      ['SKU-3', 'M3', 'R3', '', null, '新机'],
      ['SKU-4', 'M4', 'R4', '', 4, '新机'],
    ],
    dtypes: {},
  });
  assert.equal(parsed.invalidQty, 1);
  assert.equal(parsed.missingQty, 1);
  assert.deepEqual(parsed.records.map((item) => item.sku), ['SKU-4']);
});
