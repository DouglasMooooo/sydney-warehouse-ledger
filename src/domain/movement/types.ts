import type { StockCondition, LedgerAction } from '../../config/controlledValues.js';
import type { InventoryWorkflow } from '../../application/inventoryActionEngine.js';

export type MovementOrigin = 'SYSTEM_NATIVE' | 'LEGACY_MIGRATION' | 'MANUAL_IMPORT';
export type MovementInventoryEffect = 'NONE' | 'INCREASE' | 'DECREASE' | 'TRANSFER' | 'STATE_TRANSITION';
export type ReplayEligibility = 'CURRENT_STATE' | 'HISTORICAL_EVIDENCE_ONLY';
export type ValidationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type MovementVerificationStatus = 'VERIFIED' | 'WARNING' | 'CONFLICT';

export interface SourceRecordRef {
  sourceSystem: 'FEISHU_LEDGER';
  sourceType: 'OPERATIONAL_LEDGER';
  internalRecordKey: string;
}

export interface OperationalLedgerRecord {
  sourceRecordRef: SourceRecordRef;
  sourceSequence: number;
  sourceBatch?: string;
  sourceRecordIdentifier?: string;
  origin: MovementOrigin;
  businessDate: string;
  actualOutboundDate?: string;
  occurredAt?: string;
  createdAt?: string;
  createdBy?: string;
  action: string;
  sku?: string;
  displayName?: string;
  sn?: string;
  qty?: number;
  stockCondition?: StockCondition;
  sourceStockCondition?: StockCondition;
  fromLocation?: string;
  toLocation?: string;
  containerCode?: string;
  shNo?: string;
  pickupCode?: string;
  reason?: string;
  remark?: string;
}

export interface InventoryMovement {
  movementId: string;
  correlationId?: string;
  origin: MovementOrigin;
  replayEligibility: ReplayEligibility;
  sourceSequence: number;
  sourceRecordRef: SourceRecordRef;
  businessDate: string;
  occurredAt?: string;
  createdAt?: string;
  createdBy?: string;
  workflow?: InventoryWorkflow;
  ledgerAction: LedgerAction;
  sku?: string;
  displayName?: string;
  sn?: string;
  qty: number;
  stockConditionBefore?: StockCondition;
  stockConditionAfter?: StockCondition;
  fromLocation?: string;
  toLocation?: string;
  containerCode?: string;
  shNo?: string;
  pickupCode?: string;
  reason?: string;
  inventoryEffect: MovementInventoryEffect;
  verificationStatus: MovementVerificationStatus;
}

export type MovementIssueCode =
  | 'MOVE_SAME_LOCATION' | 'MOVE_SOURCE_MISMATCH' | 'MOVE_QUANTITY_DRIFT'
  | 'DUPLICATE_CURRENT_SN' | 'SN_MULTIPLE_CURRENT_STATES'
  | 'OUTBOUND_SN_NOT_IN_STOCK' | 'DOUBLE_OUTBOUND'
  | 'RETURN_SN_ALREADY_IN_STOCK' | 'RETURN_MISSING_CONFIRMED_SH'
  | 'REPAIR_COMPLETE_INVALID_STATE' | 'NEGATIVE_INVENTORY'
  | 'INVALID_SERIALIZED_QTY' | 'UNKNOWN_ACTION'
  | 'MISSING_SOURCE_LOCATION' | 'MISSING_TARGET_LOCATION'
  | 'OUTBOUND_MISSING_ACTUAL_DATE' | 'ADJUSTMENT_REASON_REQUIRED' | 'RETURN_INVALID_TARGET';

export interface MovementValidationIssue {
  code: MovementIssueCode;
  severity: ValidationSeverity;
  movementId?: string;
  sn?: string;
  message: string;
}
