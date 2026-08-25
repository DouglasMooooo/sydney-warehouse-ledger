import { isOperationalShNumber } from '../../application/shNumber.js';
import type { InventoryMovement, MovementValidationIssue, MovementVerificationStatus } from './types.js';

export function validateMovement(movement: InventoryMovement): MovementValidationIssue[] {
  const issues:MovementValidationIssue[]=[];
  const add=(code:MovementValidationIssue['code'],severity:MovementValidationIssue['severity'],message:string)=>issues.push({code,severity,movementId:movement.movementId,...(movement.sn?{sn:movement.sn}:{}),message});
  if(!Number.isFinite(movement.qty)||movement.qty<=0)add('NEGATIVE_INVENTORY','CRITICAL','Movement quantity must be positive.');
  if(movement.sn&&movement.qty!==1)add('INVALID_SERIALIZED_QTY','CRITICAL','Serialized movement quantity must equal 1.');
  if(movement.inventoryEffect==='TRANSFER'){
    if(!movement.fromLocation)add('MISSING_SOURCE_LOCATION','CRITICAL','Transfer requires a source location.');
    if(!movement.toLocation)add('MISSING_TARGET_LOCATION','CRITICAL','Transfer requires a target location.');
    if(movement.fromLocation&&movement.fromLocation===movement.toLocation)add('MOVE_SAME_LOCATION','WARNING','Source and target locations are the same.');
    if(movement.qty!==1&&movement.sn)add('MOVE_QUANTITY_DRIFT','CRITICAL','Serialized transfer must conserve one unit.');
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
  return issues;
}

export function verificationStatus(issues:readonly MovementValidationIssue[]):MovementVerificationStatus{
  return issues.some(item=>item.severity==='CRITICAL')?'CONFLICT':issues.length?'WARNING':'VERIFIED';
}
