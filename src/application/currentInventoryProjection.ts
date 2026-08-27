import type { InventoryCandidate } from './contracts.js';
import type { InventoryMovement } from '../domain/movement/types.js';
import { DeterministicSnLifecycleReplayService } from '../domain/sn/snLifecycleReplay.js';

/** Historical reports may consume legacy movements. Current operations may not. */
export type InventoryAuthority = 'AUTHORITATIVE_BASELINE' | 'SYSTEM_NATIVE_PROJECTION' | 'LEGACY_REPORT_ONLY';
export type CurrentInventorySourceType = 'PHYSICAL_SNAPSHOT' | 'EXPLICIT_BASELINE' | 'DERIVED_REPORT' | 'UNKNOWN';

export interface InventoryBaselineSnapshot {
  sourceType: Extract<CurrentInventorySourceType, 'PHYSICAL_SNAPSHOT' | 'EXPLICIT_BASELINE'>;
  effectiveDate: string;
  records: readonly InventoryCandidate[];
}

export interface CurrentInventorySnapshot {
  authority: InventoryAuthority;
  baseline: Pick<InventoryBaselineSnapshot, 'sourceType' | 'effectiveDate'>;
  records: InventoryCandidate[];
  serializedStates: ReadonlyMap<string, ReturnType<DeterministicSnLifecycleReplayService['replay']>['currentState']>;
}

export class CurrentInventoryAuthorityError extends Error {
  readonly code = 'CURRENT_INVENTORY_AUTHORITY_UNVERIFIED';
  constructor() { super('CURRENT_INVENTORY_AUTHORITY_UNVERIFIED'); }
}

export function assertAuthoritativeBaseline(sourceType: CurrentInventorySourceType, effectiveDate: string): asserts sourceType is InventoryBaselineSnapshot['sourceType'] {
  if ((sourceType !== 'PHYSICAL_SNAPSHOT' && sourceType !== 'EXPLICIT_BASELINE') || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new CurrentInventoryAuthorityError();
}

/**
 * Projects exactly one current-state path: an explicitly classified baseline plus
 * SYSTEM_NATIVE movements after that baseline. Legacy rows remain audit evidence.
 */
export class CurrentInventoryProjectionService {
  project(baseline: InventoryBaselineSnapshot, movements: readonly InventoryMovement[]): CurrentInventorySnapshot {
    assertAuthoritativeBaseline(baseline.sourceType, baseline.effectiveDate);
    const aggregate = new Map<string, InventoryCandidate>();
    const serializedBaseline = baseline.records.filter((item) => item.sn);
    for (const item of baseline.records.filter((item) => !item.sn)) add(aggregate, item, item.availableQty);
    const serialMovements = [
      ...serializedBaseline.map((item, index) => baselineMovement(item, index, baseline.effectiveDate)),
      ...movements.filter((item) => item.replayEligibility === 'CURRENT_STATE' && item.businessDate > baseline.effectiveDate && Boolean(item.sn)),
    ];
    const replay = new DeterministicSnLifecycleReplayService();
    const serialKeys = new Set(serialMovements.map((item) => canonical(item.sn ?? '')).filter(Boolean));
    const serializedStates = new Map<string, ReturnType<DeterministicSnLifecycleReplayService['replay']>['currentState']>();
    for (const key of serialKeys) serializedStates.set(key, replay.replay(key, serialMovements).currentState);
    for (const state of serializedStates.values()) if (state.status === 'IN_STOCK') {
      add(aggregate, { sn: state.sn, sku: state.sku, ...(state.displayName ? { displayName: state.displayName } : {}), location: state.location, availableQty: 1, condition: state.stockCondition }, 1);
    }
    for (const movement of movements.filter((item) => item.replayEligibility === 'CURRENT_STATE' && item.businessDate > baseline.effectiveDate && !item.sn)) applyAggregateMovement(aggregate, movement);
    return { authority: 'SYSTEM_NATIVE_PROJECTION', baseline: { sourceType: baseline.sourceType, effectiveDate: baseline.effectiveDate }, records: [...aggregate.values()].filter((item) => item.availableQty > 0).sort(compare), serializedStates };
  }
}

function applyAggregateMovement(records: Map<string, InventoryCandidate>, movement: InventoryMovement): void {
  const qty = movement.qty;
  if (!movement.sku || !Number.isFinite(qty) || qty <= 0 || movement.inventoryEffect === 'NONE') return;
  const before = movement.stockConditionBefore;
  const after = movement.stockConditionAfter;
  if (movement.inventoryEffect === 'INCREASE' && after && movement.toLocation) add(records, candidate(movement, movement.toLocation, after), qty);
  if (movement.inventoryEffect === 'DECREASE' && before && movement.fromLocation) subtract(records, candidate(movement, movement.fromLocation, before), qty);
  if ((movement.inventoryEffect === 'TRANSFER' || movement.inventoryEffect === 'STATE_TRANSITION') && before && after && movement.fromLocation && movement.toLocation) {
    subtract(records, candidate(movement, movement.fromLocation, before), qty); add(records, candidate(movement, movement.toLocation, after), qty);
  }
}

function baselineMovement(item: InventoryCandidate, index: number, date: string): InventoryMovement {
  return { movementId: `BASELINE-${index}`, identityAuthority: 'PERSISTED', origin: 'SYSTEM_NATIVE', replayEligibility: 'MIGRATION_BASELINE', sourceSequence: index,
    sourceRecordRef: { sourceSystem: 'FEISHU_LEDGER', sourceType: 'OPERATIONAL_LEDGER', internalRecordKey: `baseline:${index}` }, businessDate: date,
    ledgerAction: '期初库存', workflow: 'OPENING_BALANCE', sku: item.sku, ...(item.displayName ? { displayName: item.displayName } : {}), ...(item.sn ? { sn: item.sn } : {}),
    qty: 1, stockConditionAfter: item.condition, toLocation: item.location, ...(item.container ? { containerCode: item.container } : {}), inventoryEffect: 'INCREASE', verificationStatus: 'VERIFIED' };
}
function candidate(movement: InventoryMovement, location: string, condition: InventoryCandidate['condition']): InventoryCandidate { return { sku: movement.sku!, ...(movement.displayName ? { displayName: movement.displayName } : {}), location, availableQty: 0, condition, ...(movement.containerCode ? { container: movement.containerCode } : {}) }; }
function key(item: Pick<InventoryCandidate, 'sku' | 'location' | 'condition' | 'container' | 'sn'>): string { return [item.sn ?? '', item.sku, item.location, item.condition, item.container ?? ''].join('\u0000'); }
function add(records: Map<string, InventoryCandidate>, item: InventoryCandidate, qty: number): void { const id = key(item), existing = records.get(id); if (existing) existing.availableQty += qty; else records.set(id, { ...item, availableQty: qty }); }
function subtract(records: Map<string, InventoryCandidate>, item: InventoryCandidate, qty: number): void { const id = key(item), existing = records.get(id); if (!existing) return; existing.availableQty = Math.max(0, existing.availableQty - qty); }
function canonical(value: string): string { return value.trim().toUpperCase().replace(/\s+/g, '').replace(/^(.{7})[0R](.*)$/, '$1*$2'); }
function compare(left: InventoryCandidate, right: InventoryCandidate): number { return left.location.localeCompare(right.location) || left.sku.localeCompare(right.sku) || (left.sn ?? '').localeCompare(right.sn ?? ''); }
