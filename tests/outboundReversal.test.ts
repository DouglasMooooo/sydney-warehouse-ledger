import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmOutboundReversal, previewOutboundReversal } from '../src/application/outboundReversal.js';
import type { OutboundTransaction, WarehouseReadPort } from '../src/application/contracts.js';
import type { LedgerWriteInput } from '../src/ledger/typedWrite.js';

const transaction: OutboundTransaction = {
  ledgerRow: 42, outboundDate: '2026-08-25', shNo: 'SH-2608-001', pickupCode: 'SYD-00042',
  sku: 'SKU-1', sn: 'SN001', qty: 1, fromLocation: 'R1-2-3-L', containerCode: 'C-1',
  erpWarehouse: '悉尼良品仓', stockCondition: '维修良品',
};

function port(items: OutboundTransaction[] = [transaction], state: 'OUTBOUND' | 'GOOD' = 'OUTBOUND'): WarehouseReadPort {
  return {
    readDashboardSource: async () => { throw new Error('unused'); }, readPickupCodes: async () => [],
    findProduct: async () => undefined, findAvailableInventory: async () => [],
    findReversibleOutboundBySh: async (shNo) => shNo === 'SH-2608-001' ? items : [],
    findCurrentSerializedInventoryBatch: async (sns) => sns.map((sn) => ({
      sn, sku: 'SKU-1', location: 'R1-2-3-L', stockCondition: '维修良品', currentState: state,
    })),
  };
}

test('SH reversal preview restores each active outbound row to its original source with an auditable marker', async () => {
  const result = await previewOutboundReversal({ date: '2026-08-26', shNo: ' sh-2608-001 ' }, port());
  assert.equal(result.operation, 'OUTBOUND_REVERSAL');
  assert.match(result.commandId, /^CMD-/);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.rows[0], {
    date: '2026-08-26', action: '库存调增', shNo: 'SH-2608-001', pickupCode: 'SYD-00042',
    containerCode: 'C-1', sku: 'SKU-1', sn: 'SN001', qty: 1, toLocation: 'R1-2-3-L',
    erpWarehouse: '悉尼良品仓', stockCondition: '维修良品',
    remark: 'Outbound reversal · SH-2608-001 · OUTBOUND_REVERSAL:42',
  });
});

test('SH reversal fails closed when no active outbound exists or serialized state has changed', async () => {
  await assert.rejects(() => previewOutboundReversal({ date: '2026-08-26', shNo: 'SH-2608-001' }, port([])), /OUTBOUND_NOT_FOUND_OR_ALREADY_REVERSED/);
  await assert.rejects(() => previewOutboundReversal({ date: '2026-08-26', shNo: 'SH-2608-001' }, port([transaction], 'GOOD')), /OUTBOUND_REVERSAL_STATE_CONFLICT/);
  await assert.rejects(() => previewOutboundReversal({ date: '2026-08-26', shNo: 'bad' }, port()), /INVALID_SH_REFERENCE/);
});

test('confirm revalidates and appends only the prepared compensating rows', async () => {
  let written: readonly LedgerWriteInput[] = [];
  const result = await confirmOutboundReversal(
    { date: '2026-08-26', shNo: 'SH-2608-001' }, port(),
    { append: async (rows) => { written = rows; return { rows: [100], verified: true, reconciliation: 'PASS' }; } },
    { READ_ONLY_RELEASE: 'false', CONTROLLED_WRITE_UAT: 'true' },
  );
  assert.equal(written.length, 1);
  assert.equal(written[0]?.action, '库存调增');
  assert.equal(result.verified, true);
});
