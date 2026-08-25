import type { StockCondition } from '../../config/controlledValues.js';
import type { MovementInventoryEffect, MovementOrigin, MovementValidationIssue } from '../movement/types.js';

export interface SnLifecycleEvent {
  movementId:string;businessDate:string;action:string;sku?:string;displayName?:string;fromLocation?:string;toLocation?:string;
  conditionBefore?:StockCondition;conditionAfter?:StockCondition;shNo?:string;pickupCode?:string;origin:MovementOrigin;inventoryEffect:MovementInventoryEffect;
}
export type CurrentSnState =
  | {status:'IN_STOCK';sn:string;sku:string;displayName?:string;location:string;stockCondition:StockCondition;lastMovementId:string;lastMovementDate:string}
  | {status:'OUTBOUND';sn:string;sku?:string;lastMovementId:string;lastMovementDate:string}
  | {status:'UNKNOWN';sn:string;reason:string}
  | {status:'CONFLICT';sn:string;conflicts:string[]};
export interface SnHistoricalEvidence {movementId:string;businessDate:string;action:string;origin:MovementOrigin;summary:string}
export interface SnLifecycleReplayResult {
  sn:string;currentState:CurrentSnState;lifecycle:SnLifecycleEvent[];historicalEvidence:SnHistoricalEvidence[];
  issues:MovementValidationIssue[];replayStatus:'VERIFIED'|'WARNING'|'CONFLICT';
}
