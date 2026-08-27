import assert from 'node:assert/strict';
import test from 'node:test';
import { CurrentInventoryAuthorityError, CurrentInventoryProjectionService } from '../src/application/currentInventoryProjection.js';
import type { InventoryMovement } from '../src/domain/movement/types.js';

const service = new CurrentInventoryProjectionService();
const baseline = (records: Parameters<typeof service.project>[0]['records'], effectiveAt = '2026-08-27T13:00:00+10:00') => ({ sourceType: 'EXPLICIT_BASELINE' as const, effectiveAt, records });
function movement(overrides: Partial<InventoryMovement>): InventoryMovement { return { movementId: `MOV-${overrides.sourceSequence ?? 1}`, identityAuthority: 'PERSISTED', origin: 'SYSTEM_NATIVE', replayEligibility: 'CURRENT_STATE', sourceSequence: 1, sourceRecordRef: { sourceSystem: 'FEISHU_LEDGER', sourceType: 'OPERATIONAL_LEDGER', internalRecordKey: 'fixture' }, businessDate: '2026-08-27', createdAt: '2026-08-27T13:01:00+10:00', ledgerAction: '入库', workflow: 'INBOUND', sku: 'SKU-1', qty: 1, stockConditionAfter: '新机', toLocation: 'R1', inventoryEffect: 'INCREASE', verificationStatus: 'VERIFIED', ...overrides }; }

test('derived report is rejected instead of silently becoming current inventory authority', () => {
  assert.throws(() => service.project({ sourceType: 'DERIVED_REPORT' as never, effectiveAt: '2026-08-27T13:00:00+10:00', records: [] }, []), CurrentInventoryAuthorityError);
});

test('explicit baseline ignores legacy history and replays only native movements after its effective date', () => {
  const legacy = movement({ origin: 'LEGACY_MIGRATION', replayEligibility: 'HISTORICAL_EVIDENCE_ONLY', businessDate: '2026-08-20', qty: 100 });
  const native = movement({ qty: 2, businessDate: '2026-08-27' });
  const snapshot = service.project(baseline([{ sku: 'SKU-1', location: 'R1', availableQty: 20, condition: '新机' }]), [legacy, native]);
  assert.equal(snapshot.records[0]?.availableQty, 22);
});

test('same-day native movement uses precise timestamp boundary, offset-aware ordering, and fails closed if timestamp is absent', () => {
  const seed = [{ sku: 'SKU-1', location: 'R1', availableQty: 10, condition: '新机' as const }];
  assert.equal(service.project(baseline(seed), [movement({ createdAt: '2026-08-27T03:01:00Z', qty: 2 })]).records[0]?.availableQty, 12);
  assert.equal(service.project(baseline(seed), [movement({ createdAt: '2026-08-27T12:59:00+10:00', qty: 2 })]).records[0]?.availableQty, 10);
  assert.equal(service.project(baseline(seed), [movement({ createdAt: '2026-08-27T13:00:00+10:00', qty: 2 })]).records[0]?.availableQty, 10);
  const missingTimestamp = movement({}); delete missingTimestamp.createdAt;
  assert.throws(() => service.project(baseline(seed), [missingTimestamp]), /SYSTEM_NATIVE_MOVEMENT_TIMESTAMP_MISSING/);
});

test('baseline SN ignores legacy move and follows native move after baseline', () => {
  const legacy = movement({ origin: 'LEGACY_MIGRATION', replayEligibility: 'HISTORICAL_EVIDENCE_ONLY', businessDate: '2026-08-20', ledgerAction: '移库', workflow: 'MOVE', inventoryEffect: 'TRANSFER', sn: 'SN-A', fromLocation: 'R1', toLocation: 'R9', stockConditionBefore: '新机', stockConditionAfter: '新机' });
  const native = movement({ ledgerAction: '移库', workflow: 'MOVE', inventoryEffect: 'TRANSFER', sn: 'SN-A', fromLocation: 'R1', toLocation: 'R2', stockConditionBefore: '新机', stockConditionAfter: '新机' });
  const snapshot = service.project(baseline([{ sn: 'SN-A', sku: 'SKU-1', location: 'R1', availableQty: 1, condition: '新机' }]), [legacy, native]);
  assert.equal(snapshot.records[0]?.location, 'R2');
  assert.equal(snapshot.serializedStates.get('SN-A')?.status, 'IN_STOCK');
});
