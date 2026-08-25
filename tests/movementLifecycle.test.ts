import assert from 'node:assert/strict';
import { readFileSync,readdirSync } from 'node:fs';
import test from 'node:test';
import { correlationIdFor,derivedMovementId,legacyMovementId,systemMovementId } from '../src/domain/movement/movementIdentity.js';
import { DeterministicMovementProjectionService } from '../src/domain/movement/movementProjection.js';
import { DefaultMigrationPolicy } from '../src/domain/movement/migrationPolicy.js';
import type { InventoryMovement,OperationalLedgerRecord } from '../src/domain/movement/types.js';
import { DeterministicSnLifecycleReplayService } from '../src/domain/sn/snLifecycleReplay.js';
import { reconcileSnProjection,validateSerializedProjectionUniqueness } from '../src/application/queries/snProjectionReconciliation.js';
import { LiveMovementQueryService,ProjectedMovementRepository } from '../src/application/queries/movementQueryService.js';
import { ReplaySnContextService } from '../src/application/queries/snContextService.js';
import { validateMovement } from '../src/domain/movement/movementValidation.js';
import { buildSnReplayAudit } from '../src/application/queries/snReplayAudit.js';

const projector=new DeterministicMovementProjectionService(),replay=new DeterministicSnLifecycleReplayService();

test('movement identity is deterministic, collision-resistant for distinct business records, and independent of display ordering',()=>{
  const first=record(1,'入库',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined});
  const reordered={...first,sourceSequence:999,sourceRecordRef:{...first.sourceRecordRef,internalRecordKey:'ledger-row:999'}};
  assert.equal(legacyMovementId(first),legacyMovementId(reordered));
  assert.notEqual(legacyMovementId(first),legacyMovementId({...first,sn:'SN-DIFFERENT'}));
  assert.equal(systemMovementId('2026-08-25',137),'MOV-20260825-000137');
  assert.match(legacyMovementId(first),/^LEGACY-[A-F0-9]{20}$/);assert.notEqual(legacyMovementId(first),`LEGACY-${first.sourceSequence}`);
  assert.match(derivedMovementId(record(2,'入库',{sourceRecordIdentifier:undefined})),/^DERIVED-[A-F0-9]{20}$/);
  const persisted=project([record(3,'入库')])[0]!,unpersisted=project([record(4,'入库',{sourceRecordIdentifier:undefined})])[0]!,legacy=project([record(5,'入库',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined})])[0]!;
  assert.equal(persisted.identityAuthority,'PERSISTED');assert.match(persisted.movementId,/^MOV-/);
  assert.equal(unpersisted.identityAuthority,'DERIVED');assert.match(unpersisted.movementId,/^DERIVED-/);
  assert.equal(legacy.identityAuthority,'LEGACY');assert.match(legacy.movementId,/^LEGACY-/);
  assert.equal(correlationIdFor({movementId:'MOV-20260825-000137',ledgerAction:'备货',shNo:'SH-2608-1',sn:'SN1',businessDate:'2026-08-25'}),'CORR-SH-2608-1');
  assert.equal(correlationIdFor({movementId:'MOV-20260825-000137',transactionGroupId:'TXG-20260825-000031',ledgerAction:'库存调增',sn:'SN1',businessDate:'2026-08-25'}),'TXG-20260825-000031');
});

test('Prepare is lifecycle evidence but does not alter current state or last physical movement',()=>{
  const movements=project([record(1,'入库'),record(2,'备货',{fromLocation:'A',toLocation:undefined,stockCondition:'新机',shNo:'SH-1',pickupCode:'SYD-1'})]);
  const result=replay.replay('SN1',movements);
  assert.equal(movements[1]?.inventoryEffect,'NONE');assert.equal(result.lifecycle.length,2);
  assert.equal(result.currentState.status,'IN_STOCK');if(result.currentState.status==='IN_STOCK'){assert.equal(result.currentState.location,'A');assert.equal(result.currentState.lastMovementId,movements[0]?.movementId);}
});

test('Move A to B conserves the serialized unit and same-location move is warning',()=>{
  const moved=project([record(1,'入库'),record(2,'移库',{fromLocation:'A',toLocation:'B',sourceStockCondition:'新机'})]);
  const result=replay.replay('SN1',moved);assert.equal(result.replayStatus,'VERIFIED');assert.equal(result.currentState.status,'IN_STOCK');
  if(result.currentState.status==='IN_STOCK')assert.equal(result.currentState.location,'B');assert.equal(moved[1]?.inventoryEffect,'TRANSFER');assert.equal(moved[1]?.qty,1);
  const same=projector.projectLedgerRecords([record(3,'移库',{fromLocation:'A',toLocation:'A',sourceStockCondition:'新机'})]);
  assert(same.issues.some(issue=>issue.code==='MOVE_SAME_LOCATION'&&issue.severity==='WARNING'));
});

test('Move source mismatch is critical',()=>{
  const result=replay.replay('SN1',project([record(1,'入库'),record(2,'移库',{fromLocation:'B',toLocation:'C',sourceStockCondition:'新机'})]));
  assert.equal(result.currentState.status,'CONFLICT');if(result.currentState.status==='CONFLICT')assert.equal(result.currentState.lastKnownState?.location,'A');
  assert(result.issues.some(issue=>issue.code==='MOVE_SOURCE_MISMATCH'&&issue.severity==='CRITICAL'));
});

test('Outbound transitions in-stock to outbound and double outbound conflicts',()=>{
  const once=replay.replay('SN1',project([record(1,'入库'),record(2,'出库',{fromLocation:'A',toLocation:undefined,actualOutboundDate:'2026-08-26'})]));
  assert.equal(once.currentState.status,'OUTBOUND');
  const twice=replay.replay('SN1',project([record(1,'入库'),record(2,'出库',{fromLocation:'A',toLocation:undefined,actualOutboundDate:'2026-08-26'}),record(3,'出库',{fromLocation:'A',toLocation:undefined,actualOutboundDate:'2026-08-27'})]));
  assert.equal(twice.currentState.status,'CONFLICT');assert(twice.issues.some(issue=>issue.code==='DOUBLE_OUTBOUND'&&issue.severity==='CRITICAL'));
});

test('Adjustment decrease removes stock without describing it as outbound',()=>{
  const result=replay.replay('SN1',project([record(1,'入库'),record(2,'库存调减',{fromLocation:'A',toLocation:undefined,reason:'Controlled correction'})]));
  assert.equal(result.currentState.status,'REMOVED');if(result.currentState.status==='REMOVED')assert.equal(result.currentState.removalReason,'Controlled correction');
});

test('Return after outbound re-enters REPAIR-01 pending repair; return while in stock conflicts',()=>{
  const returned=replay.replay('SN1',project([record(1,'入库'),record(2,'出库',{fromLocation:'A',toLocation:undefined,actualOutboundDate:'2026-08-26'}),
    record(3,'退回维修',{businessDate:'2026-08-27',toLocation:'REPAIR-01',stockCondition:'待修',shNo:'SH-2'})]));
  assert.equal(returned.currentState.status,'IN_STOCK');if(returned.currentState.status==='IN_STOCK'){assert.equal(returned.currentState.location,'REPAIR-01');assert.equal(returned.currentState.stockCondition,'待修');}
  const duplicate=replay.replay('SN1',project([record(1,'入库'),record(2,'退回维修',{toLocation:'REPAIR-01',stockCondition:'待修',shNo:'SH-2'})]));
  assert.equal(duplicate.currentState.status,'CONFLICT');assert(duplicate.issues.some(issue=>issue.code==='RETURN_SN_ALREADY_IN_STOCK'));
});

test('Repair Complete collapses two ledger rows into one state transition and never creates a second unit',()=>{
  const rows=[record(1,'退回维修',{toLocation:'REPAIR-01',stockCondition:'待修',shNo:'SH-2'}),
    record(2,'库存调减',{transactionGroupId:'TXG-20260825-000031',fromLocation:'REPAIR-01',toLocation:undefined,stockCondition:'待修',remark:'Repair state correction · 维修完成状态转换'}),
    record(3,'库存调增',{transactionGroupId:'TXG-20260825-000031',sn:'SN1',fromLocation:undefined,toLocation:'B',stockCondition:'维修良品',remark:'Repair state correction · 维修完成状态转换'})];
  const movements=project(rows);assert.equal(movements.length,2);assert.equal(movements[1]?.inventoryEffect,'STATE_TRANSITION');assert.equal(movements[1]?.inferenceMethod,'EXPLICIT');assert.equal(movements[1]?.verificationStatus,'VERIFIED');
  const result=replay.replay('SN1',movements);assert.equal(result.currentState.status,'IN_STOCK');if(result.currentState.status==='IN_STOCK'){assert.equal(result.currentState.location,'B');assert.equal(result.currentState.stockCondition,'维修良品');}
});

test('canonical 0/R SN identity keeps repair-complete history together and exposes the repaired current SN',async()=>{
  const original='60HD103064PM133',repaired='60HD103R64PM133';
  const rows=[record(1,'退回维修',{sn:original,toLocation:'REPAIR-01',stockCondition:'待修',shNo:'SH-2'}),
    record(2,'库存调减',{transactionGroupId:'TXG-20260825-000032',sn:original,fromLocation:'REPAIR-01',toLocation:undefined,stockCondition:'待修',remark:'维修完成状态转换'}),
    record(3,'库存调增',{transactionGroupId:'TXG-20260825-000032',sn:repaired,fromLocation:undefined,toLocation:'B',stockCondition:'维修良品',remark:'维修完成状态转换'})];
  const repository=new ProjectedMovementRepository({readLedgerRecords:async()=>rows});const context=await new ReplaySnContextService(repository).get(original);
  assert.equal(context.currentState.status,'IN_STOCK');if(context.currentState.status==='IN_STOCK')assert.equal(context.currentState.sn,repaired);
});

test('Repair Complete from new stock is invalid',()=>{
  const transition=project([record(2,'库存调减',{transactionGroupId:'TXG-20260825-000033',fromLocation:'A',toLocation:undefined,stockCondition:'待修',remark:'维修完成状态转换'}),record(3,'库存调增',{transactionGroupId:'TXG-20260825-000033',fromLocation:undefined,toLocation:'B',stockCondition:'维修良品',remark:'维修完成状态转换'})]);
  const result=replay.replay('SN1',[...project([record(1,'入库')]),...transition]);assert.equal(result.currentState.status,'CONFLICT');assert(result.issues.some(issue=>issue.code==='REPAIR_COMPLETE_INVALID_STATE'));
});

test('system-native repair remark cannot replace explicit linkage, while legacy inference is warning-only',()=>{
  const system=projector.projectLedgerRecords([record(1,'库存调减',{fromLocation:'REPAIR-01',toLocation:undefined,stockCondition:'待修',remark:'维修完成状态转换'}),record(2,'库存调增',{stockCondition:'维修良品',remark:'维修完成状态转换'})]);
  assert.equal(system.movements.length,2);assert(system.movements.every(item=>item.inventoryEffect!=='STATE_TRANSITION'));
  assert(system.issues.some(item=>item.code==='REPAIR_COMPLETE_LINKAGE_MISSING'&&item.severity==='CRITICAL'));
  const legacyRows=[record(3,'库存调减',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,sourceBatch:'HISTORICAL_ONLY',fromLocation:'REPAIR-01',toLocation:undefined,stockCondition:'待修',remark:'维修完成状态转换'}),
    record(4,'库存调增',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,sourceBatch:'HISTORICAL_ONLY',stockCondition:'维修良品',remark:'维修完成状态转换'})];
  const legacy=projector.projectLedgerRecords(legacyRows);assert.equal(legacy.movements.length,1);assert.equal(legacy.movements[0]?.inferenceMethod,'LEGACY_HEURISTIC');
  assert.equal(legacy.movements[0]?.verificationStatus,'WARNING');assert(legacy.issues.some(item=>item.code==='LEGACY_REPAIR_INFERRED'&&item.severity==='WARNING'));
});

test('explicit repair transaction group rejects incompatible pairs',()=>{
  const result=projector.projectLedgerRecords([record(1,'库存调减',{transactionGroupId:'TXG-20260825-000041',fromLocation:'REPAIR-01',toLocation:undefined,stockCondition:'待修',remark:'维修完成'}),
    record(2,'库存调增',{transactionGroupId:'TXG-20260825-000041',sn:'OTHER-SN',stockCondition:'维修良品',remark:'维修完成'})]);
  assert.equal(result.movements.length,2);assert(result.movements.every(item=>item.inventoryEffect!=='STATE_TRANSITION'));
  assert(result.issues.some(item=>item.code==='REPAIR_COMPLETE_PAIR_MISMATCH'&&item.severity==='CRITICAL'));
});

test('historical-only legacy evidence is visible but cannot alter current state',()=>{
  const historical=record(2,'出库',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,fromLocation:'A',toLocation:undefined,actualOutboundDate:'2026-08-26',remark:'[历史追踪|不计实时库存] TH-1'});
  const result=replay.replay('SN1',project([record(1,'入库'),historical]));assert.equal(result.historicalEvidence.length,1);assert.equal(result.lifecycle.length,1);assert.equal(result.currentState.status,'IN_STOCK');
  assert.equal(new DefaultMigrationPolicy('2026-01-01').classify(record(3,'入库',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,businessDate:'2025-12-31'})),'HISTORICAL_EVIDENCE_ONLY');
});

test('migration baseline establishes state and is labelled separately from inbound',()=>{
  const baseline=record(1,'期初库存',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,sourceBatch:'CURRENT_STOCK_BASELINE'});
  const projected=project([baseline]);assert.equal(projected[0]?.replayEligibility,'MIGRATION_BASELINE');
  const result=replay.replay('SN1',projected);assert.equal(result.currentState.status,'IN_STOCK');assert.equal(result.lifecycle[0]?.action,'MIGRATION_BASELINE');assert.equal(result.historicalEvidence.length,0);
});

test('TH may remain legacy evidence but cannot confirm a system-native return',()=>{
  const projected=projector.projectLedgerRecords([record(1,'退回维修',{shNo:'TH-1',toLocation:'REPAIR-01',stockCondition:'待修'})]);
  assert(projected.issues.some(issue=>issue.code==='RETURN_MISSING_CONFIRMED_SH'&&issue.severity==='CRITICAL'));
  const legacy=projector.projectLedgerRecords([record(2,'退回维修',{origin:'LEGACY_MIGRATION',sourceRecordIdentifier:undefined,shNo:'TH-1',toLocation:'REPAIR-01',stockCondition:'待修',remark:'[历史追踪|不计实时库存]'})]);
  assert(legacy.issues.some(issue=>issue.code==='RETURN_MISSING_CONFIRMED_SH'&&issue.severity==='WARNING'));
});

test('duplicate current serialized increase is detected',()=>{
  const result=replay.replay('SN1',project([record(1,'入库'),record(2,'入库')]));assert.equal(result.currentState.status,'CONFLICT');assert(result.issues.some(issue=>issue.code==='DUPLICATE_CURRENT_SN'));
});

test('unknown ledger actions are counted and never projected by best guess',()=>{
  const result=projector.projectLedgerRecords([record(1,'未知动作')]);assert.equal(result.movements.length,0);assert.equal(result.unknownActions,1);assert(result.issues.some(issue=>issue.code==='UNKNOWN_ACTION'&&issue.severity==='CRITICAL'));
});

test('replay/current projection reconciliation covers match, missing sides, mismatch, and duplicate projection',()=>{
  const good=replay.replay('SN1',project([record(1,'入库')]));const extra=replay.replay('SN2',project([record(2,'入库',{sn:'SN2'})]));
  const result=reconcileSnProjection([good,extra],[{sn:'SN1',sku:'SKU1',location:'A',stockCondition:'新机'},{sn:'SN3',sku:'SKU1',location:'A',stockCondition:'新机'}]);
  assert.equal(result.currentProjectionCount,2);assert.equal(result.replayInStockCount,2);assert.equal(result.matched,1);assert.deepEqual(result.missingFromReplay,['SN3']);assert.deepEqual(result.missingFromCurrentProjection,['SN2']);
  const mismatch=reconcileSnProjection([good],[{sn:'SN1',sku:'OTHER',location:'B',stockCondition:'维修良品'},{sn:'SN1',sku:'OTHER',location:'B',stockCondition:'维修良品'}]);
  assert.deepEqual(mismatch.duplicateCurrentSn,['SN1']);assert.deepEqual(mismatch.locationMismatch,['SN1']);assert.deepEqual(mismatch.conditionMismatch,['SN1']);assert.deepEqual(mismatch.skuMismatch,['SN1']);
  const conflicted=replay.replay('SN4',project([record(4,'入库',{sn:'SN4'}),record(5,'移库',{sn:'SN4',fromLocation:'R9',toLocation:'B',sourceStockCondition:'新机'})]));
  assert.deepEqual(reconcileSnProjection([conflicted],[]).replayConflicts,['SN4']);
  const issues=validateSerializedProjectionUniqueness([{sn:'SN4',sku:'A',location:'A',stockCondition:'新机'},{sn:'SN4',sku:'A',location:'B',stockCondition:'新机'}]);
  assert(issues.some(item=>item.code==='DUPLICATE_CURRENT_SN'));assert(issues.some(item=>item.code==='SN_MULTIPLE_CURRENT_STATES'));
});

test('validation separates invalid movement quantity from negative replay inventory and audit stays read-only/pure',()=>{
  const invalid=projector.projectLedgerRecord(record(1,'入库',{qty:0}));assert(validateMovement(invalid).some(item=>item.code==='INVALID_MOVEMENT_QTY'));assert(!validateMovement(invalid).some(item=>item.code==='NEGATIVE_INVENTORY'));
  const decrease=project([record(2,'库存调减',{reason:'Correction',fromLocation:'A',toLocation:undefined})]);const negative=replay.replay('SN1',decrease);assert(negative.issues.some(item=>item.code==='NEGATIVE_INVENTORY'));
  const goodMovements=project([record(3,'入库')]);const report=buildSnReplayAudit(goodMovements,[{sn:'SN1',sku:'SKU1',displayName:'Product',location:'A',availableQty:1,condition:'新机'}]);
  assert.equal(report.matched,1);assert.equal(report.matchRate,1);assert.equal(report.unknownActionCount,0);assert.deepEqual(report.replayConflicts,[]);
});

test('repository-backed movement and SN context services use normalized projection without exposing source refs',async()=>{
  const repository=new ProjectedMovementRepository({readLedgerRecords:async(query)=>[record(1,'入库'),record(2,'移库',{fromLocation:'A',toLocation:'B',sourceStockCondition:'新机'})].filter(item=>!query?.sn||item.sn===query.sn)});
  const movements=await new LiveMovementQueryService(repository).search({sn:'SN1'});assert.equal(movements.items.length,2);assert(!('sourceRecordRef' in movements.items[0]!));
  const context=await new ReplaySnContextService(repository).get('SN1');assert.equal(context.currentState.status,'IN_STOCK');if(context.currentState.status==='IN_STOCK')assert.equal(context.currentState.location,'B');
});

test('UI and AI layers do not define Movement semantics independently',()=>{
  const files=['app','src/ai'].flatMap(allFiles).filter(path=>/\.tsx?$/.test(path));for(const path of files){const source=readFileSync(path,'utf8');for(const forbidden of ['function movementSemantics','const WORKFLOW_BY_ACTION','function applyMovement'])assert(!source.includes(forbidden),`${path} defines ${forbidden}`);}
  assert.equal(readFileSync('app/api/ai/inventory/route.ts','utf8').includes('Movement'),false);assert.equal(existsRoute('app/api/ai/movements/route.ts'),false);assert.equal(existsRoute('app/api/ai/sn/[sn]/route.ts'),false);
});

test('SN replay audit runner is read-only and public movement/SN routes remain absent',()=>{
  const source=readFileSync('src/scripts/auditSnReplay.ts','utf8');for(const forbidden of ['append','writeExplicitCells','prepareLedgerWrite','executeOperation','applyAdjustment'])assert(!source.includes(forbidden));
  assert(source.includes('warehouseReadAdapterFromEnv'));assert.equal(existsRoute('app/api/ai/movements/route.ts'),false);assert.equal(existsRoute('app/api/ai/sn/[sn]/route.ts'),false);
});

type RecordOverrides={ [K in keyof OperationalLedgerRecord]?: OperationalLedgerRecord[K] | undefined };
function record(sequence:number,action:string,overrides:RecordOverrides={}):OperationalLedgerRecord{
  const base:OperationalLedgerRecord={sourceRecordRef:{sourceSystem:'FEISHU_LEDGER',sourceType:'OPERATIONAL_LEDGER',internalRecordKey:`row:${sequence}`},sourceSequence:sequence,
    sourceBatch:'TEST',sourceRecordIdentifier:`MOV-20260825-${String(sequence).padStart(6,'0')}`,origin:'SYSTEM_NATIVE',businessDate:'2026-08-25',action,sku:'SKU1',displayName:'Product',sn:'SN1',qty:1,stockCondition:'新机',toLocation:'A'};
  const result={...base,...overrides} as OperationalLedgerRecord;for(const key of Object.keys(result) as Array<keyof OperationalLedgerRecord>)if(result[key]===undefined)delete result[key];return result;
}
function project(rows:OperationalLedgerRecord[]):InventoryMovement[]{return projector.projectLedgerRecords(rows).movements;}
function allFiles(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=`${directory}/${entry.name}`;return entry.isDirectory()?allFiles(path):[path];});}
function existsRoute(path:string):boolean{try{readFileSync(path);return true;}catch{return false;}}
