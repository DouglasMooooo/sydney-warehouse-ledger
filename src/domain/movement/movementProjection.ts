import { isLedgerAction } from '../../config/controlledValues.js';
import { canonicalizeSn, normalizeSn } from '../../snResolver/resolver.js';
import { correlationIdFor, movementIdentityAuthority, projectedMovementId } from './movementIdentity.js';
import { movementSemantics } from './movementSemantics.js';
import { DefaultMigrationPolicy, type MigrationPolicy } from './migrationPolicy.js';
import { validateMovement, verificationStatus } from './movementValidation.js';
import type { InventoryMovement, MovementInferenceMethod, MovementValidationIssue, OperationalLedgerRecord, RepairLinkageStatus } from './types.js';

export interface MovementProjectionResult { movements:InventoryMovement[];issues:MovementValidationIssue[];unknownActions:number }
export interface MovementProjectionService { projectLedgerRecord(record:OperationalLedgerRecord):InventoryMovement;projectLedgerRecords(records:readonly OperationalLedgerRecord[]):MovementProjectionResult }

export class DeterministicMovementProjectionService implements MovementProjectionService {
  constructor(private readonly migrationPolicy:MigrationPolicy=new DefaultMigrationPolicy()){}
  projectLedgerRecord(record:OperationalLedgerRecord):InventoryMovement{return this.project(record,[],false,repairCandidateStatus(record));}
  projectLedgerRecords(records:readonly OperationalLedgerRecord[]):MovementProjectionResult{
    const movements:InventoryMovement[]=[],issues:MovementValidationIssue[]=[];let unknownActions=0;
    const consumed=new Set<number>();
    for(let index=0;index<records.length;index++){
      if(consumed.has(index))continue;
      const record=records[index]!;
      if(!isLedgerAction(record.action)){issues.push({code:'UNKNOWN_ACTION',severity:'CRITICAL',message:`Unknown ledger action: ${record.action||'(blank)'}`});unknownActions++;continue;}
      const repairPair=findRepairCompletePair(records,index,consumed);
      const movement=repairPair?.kind==='PAIR'?this.projectRepairComplete(record,repairPair.record,repairPair.inferenceMethod):this.project(record,[],false,repairPair?.kind==='MISMATCH'?'PAIR_MISMATCH':repairCandidateStatus(record));
      if(repairPair?.kind==='PAIR')consumed.add(repairPair.index);
      movements.push(movement);issues.push(...validateMovement(movement));
    }
    return {movements,issues,unknownActions};
  }
  private project(record:OperationalLedgerRecord,related:readonly OperationalLedgerRecord[],repairComplete:boolean,repairLinkageStatus?:RepairLinkageStatus):InventoryMovement{
    if(!isLedgerAction(record.action))throw new TypeError('UNKNOWN_ACTION');
    const movementId=projectedMovementId(record,related),semantics=movementSemantics(record.action,repairComplete),condition=record.stockCondition;
    const base:InventoryMovement={movementId,identityAuthority:movementIdentityAuthority(record),origin:record.origin,replayEligibility:this.migrationPolicy.classify(record),sourceSequence:record.sourceSequence,
      sourceRecordRef:record.sourceRecordRef,businessDate:record.businessDate,ledgerAction:record.action,qty:record.qty??0,
      inventoryEffect:semantics.inventoryEffect,verificationStatus:'VERIFIED'};
    if(record.transactionGroupId)base.transactionGroupId=record.transactionGroupId;
    if(record.correlationId)base.correlationId=record.correlationId;
    if(repairLinkageStatus)base.repairLinkageStatus=repairLinkageStatus;
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
  private projectRepairComplete(decrease:OperationalLedgerRecord,increase:OperationalLedgerRecord,inferenceMethod:MovementInferenceMethod):InventoryMovement{
    const primary=decrease.action==='库存调减'?decrease:increase,other=primary===decrease?increase:decrease;
    const repaired:OperationalLedgerRecord={...primary,action:'库存调增',qty:1,stockCondition:'维修良品',sourceStockCondition:'待修'};
    if(decrease.fromLocation)repaired.fromLocation=decrease.fromLocation;if(increase.toLocation)repaired.toLocation=increase.toLocation;
    const repairedSn=increase.sn??decrease.sn,repairedReason=increase.reason??increase.remark??decrease.remark;
    if(repairedSn)repaired.sn=repairedSn;if(repairedReason)repaired.reason=repairedReason;
    const linkageStatus=inferenceMethod==='EXPLICIT'?'EXPLICIT':'LEGACY_HEURISTIC';
    const movement=this.project(repaired,[other],true,linkageStatus);
    movement.ledgerAction='库存调增';movement.workflow='REPAIR_COMPLETE';movement.inventoryEffect='STATE_TRANSITION';
    movement.inferenceMethod=inferenceMethod;
    movement.stockConditionBefore='待修';movement.stockConditionAfter='维修良品';
    movement.verificationStatus=verificationStatus(validateMovement(movement));
    return movement;
  }
}

function isRepairMarker(record:OperationalLedgerRecord){return /维修完成|Repair state correction/i.test(record.remark??'');}
type RepairPairResult={kind:'PAIR';index:number;record:OperationalLedgerRecord;inferenceMethod:MovementInferenceMethod}|{kind:'MISMATCH';index:number};
function findRepairCompletePair(records:readonly OperationalLedgerRecord[],index:number,consumed:Set<number>):RepairPairResult|undefined{
  const current=records[index]!;if(!(current.action==='库存调减'||current.action==='库存调增'))return undefined;
  const otherAction=current.action==='库存调减'?'库存调增':'库存调减';
  if(current.origin==='SYSTEM_NATIVE'){
    if(!current.transactionGroupId)return undefined;
    for(let i=index+1;i<records.length;i++){if(consumed.has(i))continue;const candidate=records[i]!;
      if(candidate.transactionGroupId!==current.transactionGroupId)continue;
      if(candidate.action!==otherAction||candidate.origin!=='SYSTEM_NATIVE'||!compatibleRepairPair(current,candidate))return {kind:'MISMATCH',index:i};
      return {kind:'PAIR',index:i,record:candidate,inferenceMethod:'EXPLICIT'};
    }
    return undefined;
  }
  if(current.origin!=='LEGACY_MIGRATION'||!isRepairMarker(current))return undefined;
  for(let i=index+1;i<records.length;i++){if(consumed.has(i))continue;const candidate=records[i]!;
    if(candidate.origin==='LEGACY_MIGRATION'&&candidate.action===otherAction&&isRepairMarker(candidate)&&compatibleRepairPair(current,candidate))
      return {kind:'PAIR',index:i,record:candidate,inferenceMethod:'LEGACY_HEURISTIC'};}
  return undefined;
}
function compatibleRepairPair(left:OperationalLedgerRecord,right:OperationalLedgerRecord):boolean{
  const decrease=left.action==='库存调减'?left:right,increase=decrease===left?right:left;
  return decrease.businessDate===increase.businessDate&&Boolean(canonicalizeSn(decrease.sn??''))&&canonicalizeSn(decrease.sn??'')===canonicalizeSn(increase.sn??'')
    &&(!decrease.sku||!increase.sku||decrease.sku===increase.sku)&&decrease.stockCondition==='待修'&&increase.stockCondition==='维修良品';
}
function repairCandidateStatus(record:OperationalLedgerRecord):RepairLinkageStatus|undefined{
  if(!(record.action==='库存调减'||record.action==='库存调增')||!isRepairMarker(record))return undefined;
  if(record.origin==='SYSTEM_NATIVE'&&!record.transactionGroupId)return 'LINKAGE_MISSING';
  return undefined;
}
function copyOptional(target:InventoryMovement,record:OperationalLedgerRecord){
  const occurredAt=record.occurredAt??record.actualOutboundDate;if(occurredAt)target.occurredAt=occurredAt;
  if(record.createdAt)target.createdAt=record.createdAt;if(record.createdBy)target.createdBy=record.createdBy;if(record.sku)target.sku=record.sku;
  if(record.displayName)target.displayName=record.displayName;if(record.fromLocation)target.fromLocation=record.fromLocation;if(record.toLocation)target.toLocation=record.toLocation;
  if(record.containerCode)target.containerCode=record.containerCode;if(record.shNo)target.shNo=record.shNo;if(record.pickupCode)target.pickupCode=record.pickupCode;
  const reason=record.reason??record.remark;if(reason)target.reason=reason;
}
