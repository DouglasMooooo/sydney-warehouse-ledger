import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTodayTasks, type OperationalLedgerRow } from '../src/application/todayTasks.js';
import { parseBusinessDateString } from '../src/ledger/businessDate.js';

const TODAY = parseBusinessDateString('2026-08-20')!;
const base: OperationalLedgerRow = {
  ledgerRow: 2, date: TODAY, outboundDate: '', action: '备货', sh: 'SH1', pickupCode: 'SYD-00001',
  sku: 'SKU1', model: 'M1', qty: 2, erpWarehouse: '悉尼良品仓', fromLocation: 'R1',
  toLocation: '', container: '', sn: '', stockCondition: '维修良品',
};

test('today prepared groups multiple SKU rows into one SH task', () => {
  const snapshot = deriveTodayTasks([base, { ...base, ledgerRow: 3, sku: 'SKU2' }], TODAY);
  assert.equal(snapshot.todayPrepared.length, 1);
  assert.equal(snapshot.todayPrepared[0]?.details.length, 2);
  assert.equal(snapshot.metricGrains.todayPrepared, 'SH_COUNT');
});

test('Prepared balance closes only after matching later Outbound by SKU', () => {
  let snapshot = deriveTodayTasks([base, { ...base, ledgerRow: 3, action: '出库', qty: 1, outboundDate: TODAY }], TODAY);
  assert.equal(snapshot.awaitingPickup.length, 1);
  assert.equal(snapshot.awaitingPickup[0]?.details[0]?.qty, 1);
  snapshot = deriveTodayTasks([base, { ...base, ledgerRow: 3, action: '出库', qty: 2, outboundDate: TODAY }], TODAY);
  assert.equal(snapshot.awaitingPickup.length, 0);
});

test('partial outbound distributes remaining same-SKU balance without duplicating it', () => {
  const rows = [
    base, { ...base, ledgerRow: 3, qty: 2 },
    { ...base, ledgerRow: 4, action: '出库', qty: 1, outboundDate: TODAY },
  ];
  const task = deriveTodayTasks(rows, TODAY).awaitingPickup[0]!;
  assert.equal(task.details.reduce((sum, item) => sum + (item.qty ?? 0), 0), 3);
});

test('today outbound uses Pickup task grain with SH fallback', () => {
  const rows = [
    { ...base, action: '出库', outboundDate: TODAY, sku: 'SKU1' },
    { ...base, ledgerRow: 3, action: '出库', outboundDate: TODAY, sku: 'SKU2' },
    { ...base, ledgerRow: 4, action: '出库', outboundDate: TODAY, pickupCode: '', sh: 'SH2' },
  ];
  assert.equal(deriveTodayTasks(rows, TODAY).todayOutbound.length, 2);
});

test('audited outbound reversal removes the shipment from active outbound and reopens its prepared task', () => {
  const rows = [
    { ...base, sh: 'SH-1', sn: 'SN1', qty: 1 },
    { ...base, ledgerRow: 3, sh: 'SH-1', sn: 'SN1', action: '出库', qty: 1, outboundDate: TODAY },
    { ...base, ledgerRow: 4, sh: 'SH-1', sn: 'SN1', action: '库存调增', qty: 1, toLocation: 'R1', remark: 'Outbound reversal · SH-1 · OUTBOUND_REVERSAL:3' },
  ];
  const snapshot = deriveTodayTasks(rows, TODAY);
  assert.equal(snapshot.todayOutbound.length, 0);
  assert.equal(snapshot.awaitingPickup.length, 1);
  assert.equal(snapshot.awaitingPickup[0]?.details[0]?.sn, 'SN1');
});

test('today return top metric grain is Qty and keeps SN rows', () => {
  const rows = [{ ...base, action: '退回维修', qty: 2, sn: 'SN1', toLocation: 'REPAIR-01' }];
  const snapshot = deriveTodayTasks(rows, TODAY);
  assert.equal(snapshot.todayReturns.length, 1);
  assert.equal(snapshot.todayReturns[0]?.details[0]?.sn, 'SN1');
  assert.equal(snapshot.metricGrains.todayReturns, 'QTY');
});
