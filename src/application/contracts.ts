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

export interface CurrentSerializedInventory {
  sn: string;
  sku: string;
  location: string;
  containerCode?: string;
  stockCondition: InventoryCandidate['condition'];
  currentState: 'REPAIR' | 'GOOD' | 'PREPARED' | 'OUTBOUND' | 'SCRAPPED' | 'UNKNOWN';
}

export interface PreparedTransaction {
  shNo: string;
  pickupCode: string;
  sku: string;
  location: string;
  containerCode?: string;
  erpWarehouse: string;
  stockCondition: InventoryCandidate['condition'];
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
  inventoryByLocation: Array<{ location: string; availableQty: number }>;
  inventoryByCondition: Array<{ condition: string; availableQty: number }>;
  activityBreakdowns: {
    thisWeekShippedQty: number;
    thisWeekReturnedQty: number;
    thisMonthShippedQty: number;
  };
  metricGrains: Record<string, 'QTY' | 'TASK_COUNT' | 'SH_COUNT' | 'PICKUP_COUNT' | 'ROW_COUNT' | 'ISSUE_COUNT' | 'UNAVAILABLE'>;
  recentPrepared: Array<{ businessDate: string; sh: string; sku: string; qty: number | null; location: string; pickupCode: string }>;
  recentReturns: Array<{ businessDate: string; sku: string; qty: number | null; location: string }>;
  exceptions: Array<{ code: string; count: number }>;
  notes: string[];
}

/** Read-only port: it intentionally has no write/append method. */
export interface WarehouseReadPort {
  /** Business projection only: never exposes sheet coordinates or formulas. */
  readCurrentInventory?(): Promise<InventoryCandidate[]>;
  readDashboardSource(asOf: BusinessDate): Promise<DashboardSnapshot>;
  findProduct(sku: string): Promise<ProductRecord | undefined>;
  findAvailableInventory(
    sku: string,
    stockCondition: InventoryCandidate['condition'],
    qty: number,
  ): Promise<InventoryCandidate[]>;
  readPickupCodes(): Promise<string[]>;
  findCurrentSerializedInventory?(sn: string): Promise<CurrentSerializedInventory | undefined>;
  findPreparedByReference?(reference: string, sn: string): Promise<PreparedTransaction | undefined>;
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
