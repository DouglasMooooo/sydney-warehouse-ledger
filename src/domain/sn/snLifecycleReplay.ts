import { canonicalizeSn, normalizeSn } from '../../snResolver/resolver.js';
import type { InventoryMovement, MovementValidationIssue } from '../movement/types.js';
import { affectsAuthoritativeSnState, validateMovement } from '../movement/movementValidation.js';
import type { CurrentSnState, LastKnownSnState, SnLifecycleEvent, SnLifecycleReplayResult } from './types.js';
import type { ReplaySnState } from './snState.js';

export interface SnLifecycleReplayService { replay(sn:string,movements:readonly InventoryMovement[]):SnLifecycleReplayResult }
export class DeterministicSnLifecycleReplayService implements SnLifecycleReplayService {
  replay(snInput:string,movements:readonly InventoryMovement[]):SnLifecycleReplayResult{
    const sn=normalizeSn(snInput);if(!sn)throw new TypeError('INVALID_SN');
    const relevant=movements.filter(item=>item.sn&&canonicalizeSn(item.sn)===canonicalizeSn(sn)).sort(compareMovement);
    const historical=relevant.filter(item=>item.replayEligibility==='HISTORICAL_EVIDENCE_ONLY');
    const current=relevant.filter(item=>item.replayEligibility!=='HISTORICAL_EVIDENCE_ONLY');
    const lifecycle=current.map(toLifecycleEvent),issues:MovementValidationIssue[]=[];
    let state:ReplaySnState={kind:'NOT_IN_STOCK'};
    for(const movement of current){
      const movementIssues=validateMovement(movement);issues.push(...movementIssues);
      const poisoning=movementIssues.filter(issue=>affectsAuthoritativeSnState(issue,movement));
      if(poisoning.length){state=poisonState(state,poisoning.map(issue=>issue.code));continue;}
      if(movement.replayEligibility==='MIGRATION_BASELINE'){state=applyBaseline(sn,state,movement,issues);continue;}
      state=applyMovement(sn,state,movement,issues);
    }
    const currentState=toCurrentState(sn,state);
    const replayStatus=currentState.status==='CONFLICT'||issues.some(item=>item.severity==='CRITICAL')?'CONFLICT':issues.length?'WARNING':'VERIFIED';
    return {sn,currentState,lifecycle,historicalEvidence:historical.map(item=>({movementId:item.movementId,businessDate:item.businessDate,action:item.ledgerAction,
      origin:item.origin,summary:`${item.ledgerAction} ${item.sku??''} ${item.fromLocation??''} ${item.toLocation??''}`.trim()})),issues:dedupeIssues(issues),replayStatus};
  }
}

function applyMovement(sn:string,state:ReplaySnState,movement:InventoryMovement,issues:MovementValidationIssue[]):ReplaySnState{
  if(state.kind==='CONFLICT')return state;
  const critical=(code:MovementValidationIssue['code'],message:string):ReplaySnState=>{issues.push({code,severity:'CRITICAL',movementId:movement.movementId,sn,message});return poisonState(state,[code]);};
  if(movement.workflow==='PREPARE'||movement.inventoryEffect==='NONE')return state;
  if(movement.workflow==='INBOUND'||movement.workflow==='OPENING_BALANCE'||movement.workflow==='ADJUST_INCREASE'||movement.ledgerAction==='入库'||movement.ledgerAction==='期初库存'){
    if(state.kind==='IN_STOCK')return critical(movement.ledgerAction==='退回维修'?'RETURN_SN_ALREADY_IN_STOCK':'DUPLICATE_CURRENT_SN','Serialized unit is already in current stock.');
    return inStockState(movement);
  }
  if(movement.workflow==='RETURN_REPAIR'||movement.ledgerAction==='退回维修'){
    if(state.kind==='IN_STOCK')return critical('RETURN_SN_ALREADY_IN_STOCK','Serialized unit is already in current stock.');
    return inStockState(movement);
  }
  if(movement.workflow==='MOVE'||movement.inventoryEffect==='TRANSFER'){
    if(state.kind!=='IN_STOCK')return critical('MOVE_SOURCE_MISMATCH','Move requires the SN to be in stock.');
    if(!state.location||state.location!==movement.fromLocation)return critical('MOVE_SOURCE_MISMATCH',`Expected source ${state.location??'UNKNOWN'}, received ${movement.fromLocation??'UNKNOWN'}.`);
    return {...state,...(movement.toLocation?{location:movement.toLocation}:{}),...(movement.stockConditionAfter?{stockCondition:movement.stockConditionAfter}:{}),lastMovementId:movement.movementId,lastMovementDate:movement.businessDate};
  }
  if(movement.workflow==='REPAIR_COMPLETE'||movement.inventoryEffect==='STATE_TRANSITION'){
    if(state.kind!=='IN_STOCK'||state.stockCondition!=='待修')return critical('REPAIR_COMPLETE_INVALID_STATE','Repair completion requires current pending-repair stock.');
    return {...state,...(movement.sn?{currentSn:movement.sn}:{}),...(movement.sku?{sku:movement.sku}:{}),...(movement.displayName?{displayName:movement.displayName}:{}),
      ...(movement.toLocation?{location:movement.toLocation}:{}),stockCondition:'维修良品',lastMovementId:movement.movementId,lastMovementDate:movement.businessDate};
  }
  if(movement.workflow==='OUTBOUND'||movement.ledgerAction==='出库'){
    if(state.kind==='OUTBOUND')return critical('DOUBLE_OUTBOUND','SN is already outbound.');
    if(state.kind!=='IN_STOCK')return critical('OUTBOUND_SN_NOT_IN_STOCK','Outbound/decrease requires current stock.');
    return {kind:'OUTBOUND',...(state.currentSn?{currentSn:state.currentSn}:movement.sn?{currentSn:movement.sn}:{}),...(state.sku?{sku:state.sku}:movement.sku?{sku:movement.sku}:{}),...(movement.shNo?{shNo:movement.shNo}:{}),lastMovementId:movement.movementId,lastMovementDate:movement.businessDate};
  }
  if(movement.workflow==='ADJUST_DECREASE'||movement.ledgerAction==='库存调减'){
    if(state.kind!=='IN_STOCK')return critical('NEGATIVE_INVENTORY','Adjustment decrease would remove a serialized unit that is not in stock.');
    return {kind:'REMOVED',...(state.currentSn?{currentSn:state.currentSn}:movement.sn?{currentSn:movement.sn}:{}),...(state.sku?{sku:state.sku}:movement.sku?{sku:movement.sku}:{}),...(movement.reason?{removalReason:movement.reason}:{}),lastMovementId:movement.movementId,lastMovementDate:movement.businessDate};
  }
  return critical('UNKNOWN_ACTION','Movement lifecycle semantics are not explicitly supported.');
}

function applyBaseline(sn:string,state:ReplaySnState,movement:InventoryMovement,issues:MovementValidationIssue[]):ReplaySnState{
  if(state.kind==='CONFLICT')return state;
  if(movement.inventoryEffect!=='INCREASE'){issues.push({code:'UNKNOWN_ACTION',severity:'CRITICAL',movementId:movement.movementId,sn,message:'Migration baseline must be an inventory seed, not an operational decrease or transfer.'});return poisonState(state,['UNKNOWN_ACTION']);}
  if(state.kind!=='NOT_IN_STOCK'){issues.push({code:'DUPLICATE_CURRENT_SN',severity:'CRITICAL',movementId:movement.movementId,sn,message:'Migration baseline conflicts with an existing replay state.'});return poisonState(state,['DUPLICATE_CURRENT_SN']);}
  return inStockState(movement);
}
function inStockState(movement:InventoryMovement):ReplaySnState{return {kind:'IN_STOCK',...(movement.sn?{currentSn:movement.sn}:{}),...(movement.sku?{sku:movement.sku}:{}),...(movement.displayName?{displayName:movement.displayName}:{}),
  ...(movement.toLocation?{location:movement.toLocation}:{}),...(movement.stockConditionAfter?{stockCondition:movement.stockConditionAfter}:{}),lastMovementId:movement.movementId,lastMovementDate:movement.businessDate};}

function toCurrentState(sn:string,state:ReplaySnState):CurrentSnState{
  if(state.kind==='CONFLICT')return {status:'CONFLICT',sn,conflicts:[...new Set(state.conflicts)],...(state.lastKnownState?{lastKnownState:state.lastKnownState}:{})};
  if(state.kind==='OUTBOUND')return {status:'OUTBOUND',sn:state.currentSn??sn,...(state.sku?{sku:state.sku}:{}),...(state.shNo?{shNo:state.shNo}:{}),lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  if(state.kind==='REMOVED')return {status:'REMOVED',sn:state.currentSn??sn,...(state.sku?{sku:state.sku}:{}),...(state.removalReason?{removalReason:state.removalReason}:{}),lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  if(state.kind==='IN_STOCK'){
    if(!state.sku||!state.location||!state.stockCondition)return {status:'UNKNOWN',sn,reason:'Current replay lacks SKU, location, or stock condition.'};
    return {status:'IN_STOCK',sn:state.currentSn??sn,sku:state.sku,...(state.displayName?{displayName:state.displayName}:{}),location:state.location,stockCondition:state.stockCondition,lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  }
  return {status:'UNKNOWN',sn,reason:'No current-state eligible inventory movement was found.'};
}
function toLifecycleEvent(item:InventoryMovement):SnLifecycleEvent{return {movementId:item.movementId,businessDate:item.businessDate,action:item.replayEligibility==='MIGRATION_BASELINE'?'MIGRATION_BASELINE':item.workflow??item.ledgerAction,
  ...(item.sku?{sku:item.sku}:{}),...(item.displayName?{displayName:item.displayName}:{}),...(item.fromLocation?{fromLocation:item.fromLocation}:{}),
  ...(item.toLocation?{toLocation:item.toLocation}:{}),...(item.stockConditionBefore?{conditionBefore:item.stockConditionBefore}:{}),
  ...(item.stockConditionAfter?{conditionAfter:item.stockConditionAfter}:{}),...(item.shNo?{shNo:item.shNo}:{}),...(item.pickupCode?{pickupCode:item.pickupCode}:{}),origin:item.origin,inventoryEffect:item.inventoryEffect,
  replayEligibility:item.replayEligibility as Exclude<InventoryMovement['replayEligibility'],'HISTORICAL_EVIDENCE_ONLY'>};}
// sourceSequence is a migration-only tie breaker for legacy rows without timestamps; it is not business time or Movement identity.
function compareMovement(a:InventoryMovement,b:InventoryMovement){return a.businessDate.localeCompare(b.businessDate)||(a.occurredAt??a.createdAt??'').localeCompare(b.occurredAt??b.createdAt??'')||a.sourceSequence-b.sourceSequence||a.movementId.localeCompare(b.movementId);}
function poisonState(state:ReplaySnState,codes:string[]):ReplaySnState{
  if(state.kind==='CONFLICT')return {...state,conflicts:[...state.conflicts,...codes]};
  const known=lastKnownState(state);return {kind:'CONFLICT',conflicts:codes,...(known?{lastKnownState:known}:{})};
}
function lastKnownState(state:ReplaySnState):LastKnownSnState|undefined{
  if(state.kind==='IN_STOCK')return {status:'IN_STOCK',...(state.sku?{sku:state.sku}:{}),...(state.displayName?{displayName:state.displayName}:{}),...(state.location?{location:state.location}:{}),...(state.stockCondition?{stockCondition:state.stockCondition}:{}),lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  if(state.kind==='OUTBOUND')return {status:'OUTBOUND',...(state.sku?{sku:state.sku}:{}),lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  if(state.kind==='REMOVED')return {status:'REMOVED',...(state.sku?{sku:state.sku}:{}),lastMovementId:state.lastMovementId,lastMovementDate:state.lastMovementDate};
  return undefined;
}
function dedupeIssues(items:MovementValidationIssue[]){const seen=new Set<string>();return items.filter(item=>{const key=`${item.code}|${item.movementId??''}|${item.sn??''}`;if(seen.has(key))return false;seen.add(key);return true;});}
