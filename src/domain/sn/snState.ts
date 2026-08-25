import type { StockCondition } from '../../config/controlledValues.js';
export type ReplaySnState=
  | {kind:'NOT_IN_STOCK'}
  | {kind:'IN_STOCK';currentSn?:string;sku?:string;displayName?:string;location?:string;stockCondition?:StockCondition;lastMovementId:string;lastMovementDate:string}
  | {kind:'OUTBOUND';currentSn?:string;sku?:string;lastMovementId:string;lastMovementDate:string}
  | {kind:'CONFLICT';conflicts:string[]};
