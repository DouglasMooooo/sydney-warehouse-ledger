import { isOperationalShNumber } from '../../application/shNumber.js';
import type { InventoryMovement, MovementValidationIssue, MovementVerificationStatus } from './types.js';

export function validateMovement(movement: InventoryMovement): MovementValidationIssue[] {
  const issues:MovementValidationIssue[]=[];
  const add=(code:MovementValidationIssue['code'],severity:MovementValidationIssue['severity'],message:string)=>issues.push({code,severity,movementId:movement.movementId,...(movement.sn?{sn:movement.sn}:{}),message});
  if(!Number.isFinite(movement.qty)||movement.qty<=0)add('INVALID_MOVEMENT_QTY','CRITICAL','Movement quantity must be positive.');
  if(movement.sn&&movement.qty!==1)add('INVALID_SERIALIZED_QTY','CRITICAL','Serialized movement quantity must equal 1.');
  if(movement.inventoryEffect==='TRANSFER'){
    if(!movement.fromLocation)add('MISSING_SOURCE_LOCATION','CRITICAL','Transfer requires a source location.');
    if(!movement.toLocation)add('MISSING_TARGET_LOCATION','CRITICAL','Transfer requires a target location.');
    if(movement.fromLocation&&movement.fromLocation===movement.toLocation)add('MOVE_SAME_LOCATION','WARNING','Source and target locations are the same.');
  }
  if(movement.ledgerAction==='入库'&&!movement.toLocation)add('MISSING_TARGET_LOCATION','CRITICAL','Inbound requires a target location.');
  if(movement.ledgerAction==='出库'){
    if(!movement.fromLocation)add('MISSING_SOURCE_LOCATION','CRITICAL','Outbound requires a source location.');
    if(!movement.occurredAt)add('OUTBOUND_MISSING_ACTUAL_DATE',movement.origin==='SYSTEM_NATIVE'?'CRITICAL':'WARNING','Outbound actual date is missing.');
  }
  if(movement.ledgerAction==='退回维修'){
    if(movement.toLocation!=='REPAIR-01'||movement.stockConditionAfter!=='待修')add('RETURN_INVALID_TARGET','CRITICAL','Return must enter REPAIR-01 as pending repair.');
    if(!movement.shNo||!isOperationalShNumber(movement.shNo))add('RETURN_MISSING_CONFIRMED_SH',movement.origin==='SYSTEM_NATIVE'?'CRITICAL':'WARNING','Return has no confirmed operational SH.');
  }
  if((movement.ledgerAction==='库存调增'||movement.ledgerAction==='库存调减')&&movement.inventoryEffect!=='STATE_TRANSITION'&&!movement.reason)
    add('ADJUSTMENT_REASON_REQUIRED',movement.origin==='SYSTEM_NATIVE'?'CRITICAL':'WARNING','Adjustment reason is required.');
  if(movement.repairLinkageStatus==='LINKAGE_MISSING')add('REPAIR_COMPLETE_LINKAGE_MISSING',movement.origin==='SYSTEM_NATIVE'?'CRITICAL':'WARNING','Repair completion candidate has no explicit transaction linkage.');
  if(movement.repairLinkageStatus==='PAIR_MISMATCH')add('REPAIR_COMPLETE_PAIR_MISMATCH','CRITICAL','Repair completion transaction group contains an incompatible pair.');
  if(movement.repairLinkageStatus==='LEGACY_HEURISTIC')add('LEGACY_REPAIR_INFERRED','WARNING','Repair completion was inferred from compatible legacy rows.');
  return issues;
}

const STATE_AFFECTING_CODES=new Set<MovementValidationIssue['code']>([
  'MOVE_SOURCE_MISMATCH','DUPLICATE_CURRENT_SN','SN_MULTIPLE_CURRENT_STATES','OUTBOUND_SN_NOT_IN_STOCK','DOUBLE_OUTBOUND',
  'RETURN_SN_ALREADY_IN_STOCK','RETURN_MISSING_CONFIRMED_SH','REPAIR_COMPLETE_INVALID_STATE','REPAIR_COMPLETE_LINKAGE_MISSING',
  'REPAIR_COMPLETE_PAIR_MISMATCH','INVALID_MOVEMENT_QTY','NEGATIVE_INVENTORY','INVALID_SERIALIZED_QTY','MISSING_SOURCE_LOCATION',
  'MISSING_TARGET_LOCATION','RETURN_INVALID_TARGET',
]);

export function affectsAuthoritativeSnState(issue:MovementValidationIssue,movement:InventoryMovement):boolean{
  return issue.severity==='CRITICAL'&&movement.replayEligibility!=='HISTORICAL_EVIDENCE_ONLY'&&movement.inventoryEffect!=='NONE'&&STATE_AFFECTING_CODES.has(issue.code);
}

export function verificationStatus(issues:readonly MovementValidationIssue[]):MovementVerificationStatus{
  return issues.some(item=>item.severity==='CRITICAL')?'CONFLICT':issues.length?'WARNING':'VERIFIED';
}
