import type { ProposedChange } from '../feishu/types.js';
import type { LedgerStateSnapshot } from '../ledger/optimisticConcurrency.js';
import type { NormalizedLedgerInput, ValidationError } from '../ledger/validators.js';

export interface ActorContext {
  userId: string;
  displayName: string;
}

export interface PreparedCommand<T> {
  previewToken: string;
  input: T;
  normalized: NormalizedLedgerInput;
  proposedChanges: ProposedChange[];
  sourceState: LedgerStateSnapshot;
  warnings: ValidationError[];
}

export interface ConfirmCommand {
  previewToken: string;
  actor: ActorContext;
}

export interface ConfirmedLedgerOperation {
  row: number;
  verified: true;
  reconciliation: 'PASS';
}

export interface InventoryQueryService {
  getBySerialNumber(sn: string): Promise<unknown>;
  getAvailableBySku(sku: string): Promise<unknown[]>;
  getDashboardSnapshot(asOf: Date): Promise<DashboardSnapshot>;
}

export interface WorkOrderService<TInput = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<PreparedCommand<TInput>>;
  confirm(command: ConfirmCommand): Promise<ConfirmedLedgerOperation>;
}

export interface ReturnIntakeService<TInput = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<PreparedCommand<TInput>>;
  confirm(command: ConfirmCommand): Promise<ConfirmedLedgerOperation>;
}

export interface MoveService<TInput = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<PreparedCommand<TInput>>;
  confirm(command: ConfirmCommand): Promise<ConfirmedLedgerOperation>;
}

export interface AdjustmentService<TInput = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<PreparedCommand<TInput>>;
  confirm(command: ConfirmCommand): Promise<ConfirmedLedgerOperation>;
}

export interface PickupCodeCandidate {
  code: string;
  sourceState: LedgerStateSnapshot;
}

export interface PickupCodeService {
  prepareCandidate(): Promise<PickupCodeCandidate>;
  recheckOrRegenerate(candidate: PickupCodeCandidate): Promise<PickupCodeCandidate>;
  verifyGloballyUnique(code: string): Promise<boolean>;
}

export interface LabelService<TInput = unknown, TPreview = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<TPreview>;
  confirm(command: ConfirmCommand): Promise<Uint8Array>;
}

export interface DashboardSnapshot {
  todayNewWorkOrders: number;
  awaitingPreparation: number;
  awaitingPickup: number;
  shippedToday: number;
  returnedToday: number;
  exceptionCount: number;
  inventory: {
    newUnits: number;
    repairedGood: number;
    pendingRepair: number;
    repairInventory: number;
    scrapped: number;
  };
}

export interface DashboardQueryService {
  getSnapshot(asOf: Date): Promise<DashboardSnapshot>;
}
