import type { BusinessDate } from '../ledger/businessDate.js';
import type { OperationPrecondition } from '../ledger/optimisticConcurrency.js';
import type { NormalizedLedgerInput, ValidationError } from '../ledger/validators.js';

export interface ActorContext {
  userId: string;
  displayName: string;
}

/** Internal-only prepare result. Never serialize this object to the browser. */
export interface PreparedCommand<T> {
  input: T;
  normalized: NormalizedLedgerInput;
  operationPrecondition: OperationPrecondition;
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

export interface InventoryCandidate {
  sku: string;
  model: string;
  location: string;
  container?: string;
  availableQty: number;
  condition: '新机' | '维修良品' | '待修' | '报废' | '物料';
}

export interface ProductRecord {
  sku: string;
  model: string;
}

export interface DashboardSnapshot {
  businessDate: BusinessDate;
  metrics: {
    todayPreparedWorkOrders: number;
    awaitingPreparation: number | null;
    awaitingPickup: number;
    shippedToday: number;
    returnedToday: number;
    exceptionCount: number;
  };
  inventory: {
    newUnits: number;
    repairedGood: number;
    pendingRepair: number;
    repairInventory: number;
    scrapped: number;
  };
  inventoryByModel: Array<{ model: string; condition: string; availableQty: number }>;
  recentPrepared: Array<{ businessDate: string; sh: string; sku: string; qty: number | null; location: string; pickupCode: string }>;
  recentReturns: Array<{ businessDate: string; sku: string; qty: number | null; location: string }>;
  exceptions: Array<{ code: string; count: number }>;
  notes: string[];
}

/** Read-only port: it intentionally has no write/append method. */
export interface WarehouseReadPort {
  readDashboardSource(asOf: BusinessDate): Promise<DashboardSnapshot>;
  findProduct(sku: string): Promise<ProductRecord | undefined>;
  findAvailableInventory(
    sku: string,
    stockCondition: InventoryCandidate['condition'],
    qty: number,
  ): Promise<InventoryCandidate[]>;
  readPickupCodes(): Promise<string[]>;
}

export interface InventoryQueryService {
  getAvailableBySku(
    sku: string,
    stockCondition: InventoryCandidate['condition'],
    qty: number,
  ): Promise<InventoryCandidate[]>;
}

export interface DashboardQueryService {
  getSnapshot(asOf: BusinessDate): Promise<DashboardSnapshot>;
}

export interface WorkOrderService<TInput = unknown, TPreview = unknown> {
  prepare(input: TInput, actor?: ActorContext): Promise<TPreview>;
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
  committed: false;
}

export interface PickupCodeService {
  prepareCandidate(): Promise<PickupCodeCandidate>;
}

export interface LabelService<TInput = unknown, TPreview = unknown> {
  prepare(input: TInput, actor: ActorContext): Promise<TPreview>;
  confirm(command: ConfirmCommand): Promise<Uint8Array>;
}
