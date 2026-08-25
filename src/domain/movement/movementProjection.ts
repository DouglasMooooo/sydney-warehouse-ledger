import { isLedgerAction } from '../../config/controlledValues.js';
import { canonicalizeSn, normalizeSn } from '../../snResolver/resolver.js';
import { correlationIdFor, projectedMovementId } from './movementIdentity.js';
import { movementSemantics } from './movementSemantics.js';
import { DefaultMigrationPolicy, type MigrationPolicy } from './migrationPolicy.js';
import { validateMovement, verificationStatus } from './movementValidation.js';
import type { InventoryMovement, MovementValidationIssue, OperationalLedgerRecord } from './types.js';

export interface MovementProjectionResult { movements:InventoryMovement[];issues:MovementValidationIssue[];unknownActions:number }
export interface MovementProjectionService { projectLedgerRecord(record:OperationalLedgerRecord):InventoryMovement;projectLedgerRecords(records:readonly OperationalLedgerRecord[]):MovementProjectionResult }

export class DeterministicMovementProjectionService implements MovementProjectionService {
  constructor(private readonly migrationPolicy:MigrationPolicy=new DefaultMigrationPolicy()){}
  projectLedgerRecord(record:OperationalLedgerRecord):InventoryMovement{return this.project(record,[],false);}
  projectLedgerRecords(records:readonly OperationalLedgerRecord[]):MovementProjectionResult{
    const movements:InventoryMovement[]=[],issues:MovementValidationIssue[]=[];let unknownActions=0;
    const consumed=new Set<number>();
    for(let index=0;index<records.length;index++){
      if(consumed.has(index))continue;
      const record=records[index]!;
      if(!isLedgerAction(record.action)){issues.push({code:'UNKNOWN_ACTION',severity:'CRITICAL',message:`Unknown ledger action: ${record.action||'(blank)'}`});unknownActions++;continue;}
      const repairPair=findRepairCompletePair(records,index,consumed);
      const movement=repairPair?this.projectRepairComplete(record,repairPair.record):this.project(record,[],false);
      if(repairPair)consumed.add(repairPair.index);
      movements.push(movement);issues.push(...validateMovement(movement));
    }
    return {movements,issues,unknownActions};
  }
  private project(record:OperationalLedgerRecord,related:readonly OperationalLedgerRecord[],repairComplete:boolean):InventoryMovement{
    if(!isLedgerAction(record.action))throw new TypeError('UNKNOWN_ACTION');
    const movementId=projectedMovementId(record,related),semantics=movementSemantics(record.action,repairComplete),condition=record.stockCondition;
    const base:InventoryMovement={movementId,origin:record.origin,replayEligibility:this.migrationPolicy.classify(record),sourceSequence:record.sourceSequence,
      sourceRecordRef:record.sourceRecordRef,businessDate:record.businessDate,ledgerAction:record.action,qty:record.qty??0,
      inventoryEffect:semantics.inventoryEffect,verificationStatus:'VERIFIED'};
    if(semantics.workflow)base.workflow=semantics.workflow;
    copyOptional(base,record);
    if(record.sn)base.sn=normalizeSn(record.sn);
    if(semantics.inventoryEffect==='INCREASE'&&condition)base.stockConditionAfter=condition;
    if(semantics.inventoryEffect==='DECREASE'&&condition)base.stockConditionBefore=condition;
    if(semantics.inventoryEffect==='TRANSFER'){const before=record.sourceStockCondition??condition,after=condition??record.sourceStockCondition;if(before)base.stockConditionBefore=before;if(after)base.stockConditionAfter=after;}
    base.correlationId=correlationIdFor(base);
    base.verificationStatus=verificationStatus(validateMovement(base));
    return base;
  }
  private projectRepairComplete(decrease:OperationalLedgerRecord,increase:OperationalLedgerRecord):InventoryMovement{
    const primary=decrease.action==='库存调减'?decrease:increase,other=primary===decrease?increase:decrease;
    const repaired:OperationalLedgerRecord={...primary,action:'库存调增',qty:1,stockCondition:'维修良品',sourceStockCondition:'待修'};
    if(decrease.fromLocation)repaired.fromLocation=decrease.fromLocation;if(increase.toLocation)repaired.toLocation=increase.toLocation;
    const repairedSn=increase.sn??decrease.sn,repairedReason=increase.reason??increase.remark??decrease.remark;
    if(repairedSn)repaired.sn=repairedSn;if(repairedReason)repaired.reason=repairedReason;
    const movement=this.project(repaired,[other],true);
    movement.ledgerAction='库存调增';movement.workflow='REPAIR_COMPLETE';movement.inventoryEffect='STATE_TRANSITION';
    movement.stockConditionBefore='待修';movement.stockConditionAfter='维修良品';
    movement.verificationStatus=verificationStatus(validateMovement(movement));
    return movement;
  }
}

function isRepairMarker(record:OperationalLedgerRecord){return /维修完成|Repair state correction/i.test(record.remark??'');}
function findRepairCompletePair(records:readonly OperationalLedgerRecord[],index:number,consumed:Set<number>):{index:number;record:OperationalLedgerRecord}|undefined{
  const current=records[index]!;if(!isRepairMarker(current)||!(current.action==='库存调减'||current.action==='库存调增'))return undefined;
  const otherAction=current.action==='库存调减'?'库存调增':'库存调减';
  for(let i=index+1;i<records.length;i++){if(consumed.has(i))continue;const candidate=records[i]!;
    if(candidate.action===otherAction&&isRepairMarker(candidate)&&candidate.businessDate===current.businessDate&&candidate.sku===current.sku
      &&canonicalizeSn(candidate.sn??'')===canonicalizeSn(current.sn??''))return {index:i,record:candidate};}
  return undefined;
}
function copyOptional(target:InventoryMovement,record:OperationalLedgerRecord){
  const occurredAt=record.occurredAt??record.actualOutboundDate;if(occurredAt)target.occurredAt=occurredAt;
  if(record.createdAt)target.createdAt=record.createdAt;if(record.createdBy)target.createdBy=record.createdBy;if(record.sku)target.sku=record.sku;
  if(record.displayName)target.displayName=record.displayName;if(record.fromLocation)target.fromLocation=record.fromLocation;if(record.toLocation)target.toLocation=record.toLocation;
  if(record.containerCode)target.containerCode=record.containerCode;if(record.shNo)target.shNo=record.shNo;if(record.pickupCode)target.pickupCode=record.pickupCode;
  const reason=record.reason??record.remark;if(reason)target.reason=reason;
}
