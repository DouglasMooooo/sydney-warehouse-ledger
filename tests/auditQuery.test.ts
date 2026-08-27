import assert from 'node:assert/strict';
import test from 'node:test';
import { LiveLedgerAuditService } from '../src/application/auditQueryService.js';
import type { OperationalLedgerRecord } from '../src/domain/movement/types.js';

const records: OperationalLedgerRecord[] = [
  record(2, '入库', { sn: '60HD103064PM133', toLocation: 'R1-1-1-L', stockCondition: '新机' }),
  record(3, '备货', { sn: '60HD103064PM133', fromLocation: 'R1-1-1-L', shNo: 'SH-2608-001', pickupCode: 'SYD-00001', erpWarehouse: '悉尼物料仓', stockCondition: '新机' }),
  record(4, '出库', { sn: '60HD103064PM133', fromLocation: 'R1-1-1-L', shNo: 'SH-2608-001', pickupCode: 'SYD-00001', erpWarehouse: '悉尼物料仓', stockCondition: '新机', actualOutboundDate: '2026-08-26' }),
];

const port = { readLedgerRecords: async (query: { shNo?: string; sn?: string } = {}) => records.filter((item) =>
  (!query.shNo || item.shNo === query.shNo) && (!query.sn || item.sn === query.sn),
) };

test('audit query returns all SH fields and preserves ERP warehouse in the projected audit record', async () => {
  const result = await new LiveLedgerAuditService(port).search({ shNo: 'sh-2608-001' });
  assert.equal(result.query.type, 'SH');
  assert.equal(result.records.length, 2);
  assert(result.records.every((item) => item.shNo === 'SH-2608-001'));
  assert.equal(result.records[0]?.erpWarehouse, '悉尼物料仓');
});

test('SN audit returns complete lifecycle and deterministic current state without fuzzy matching', async () => {
  const result = await new LiveLedgerAuditService(port).search({ sn: ' 60hd103064pm133 ' });
  assert.equal(result.query.type, 'SN');
  assert.equal(result.records.length, 3);
  assert.equal(result.currentSnState?.status, 'OUTBOUND');
  await assert.rejects(() => new LiveLedgerAuditService(port).search({ shNo: 'SH-1', sn: 'SN1' }), /AUDIT_QUERY_REQUIRES_ONE_IDENTIFIER/);
});

function record(sequence: number, action: OperationalLedgerRecord['action'], values: Partial<OperationalLedgerRecord>): OperationalLedgerRecord {
  return {
    sourceRecordRef: { sourceSystem: 'FEISHU_LEDGER', sourceType: 'OPERATIONAL_LEDGER', internalRecordKey: `row:${sequence}` },
    sourceSequence: sequence, sourceBatch: 'FEISHU_OPERATIONAL_LEDGER', origin: 'SYSTEM_NATIVE', businessDate: '2026-08-26', action,
    sku: '97-141-00060-B0', displayName: 'H3-10.0-Smart', qty: 1, ...values,
  };
}
