import { STOCK_CONDITIONS, type StockCondition } from '../../config/controlledValues.js';
import { reconcileSnProjection, type SerializedInventoryProjection } from '../../application/queries/snProjectionReconciliation.js';
import { canonicalizeSn } from '../../snResolver/resolver.js';
import { DeterministicSnLifecycleReplayService } from '../sn/snLifecycleReplay.js';
import { normalizeLocation } from './normalization.js';
import type { BaselineReplaySimulationInput, BaselineReplaySimulationReport, BaselineSimulationMetrics, MigrationBaselineCandidate, MigrationManifest } from './types.js';

export class BaselineReplaySimulation {
  simulate(input:BaselineReplaySimulationInput):BaselineReplaySimulationReport{
    const preCutover=input.movements.filter(item=>item.businessDate<=input.policy.cutoverDate).map(item=>({...item,replayEligibility:'HISTORICAL_EVIDENCE_ONLY' as const}));
    const postCutover=input.movements.filter(item=>item.businessDate>input.policy.cutoverDate).map(item=>({...item,replayEligibility:'CURRENT_STATE' as const}));
    const target=targetProjection(input.physicalTarget);
    return {baselineCandidates:input.candidates.length,verifiedCandidates:input.candidates.filter(item=>item.verificationStatus==='VERIFIED').length,reviewRequired:input.candidates.filter(item=>item.verificationStatus==='REVIEW_REQUIRED').length,candidateConflicts:input.candidates.filter(item=>item.verificationStatus==='CONFLICT').length,
      postCutoverMovements:postCutover.length,simulationScope:postCutover.length?'BASELINE_PLUS_POST_CUTOVER':'BASELINE_ONLY',strict:this.run(input.candidates.filter(item=>item.verificationStatus==='VERIFIED'),preCutover,postCutover,target),permissive:this.run(input.candidates.filter(item=>item.verificationStatus!=='CONFLICT'),preCutover,postCutover,target),orderingRiskMovementCount:input.movements.filter(item=>item.businessDate===input.policy.cutoverDate).length,historicalEvidenceCount:preCutover.length};
  }

  private run(candidates:readonly MigrationBaselineCandidate[],preCutover:readonly import('../movement/types.js').InventoryMovement[],postCutover:readonly import('../movement/types.js').InventoryMovement[],target:ReturnType<typeof targetProjection>):BaselineSimulationMetrics{
    const baselineMovements=candidates.filter(usableCandidate).map((item,index)=>baselineMovement(item,index));
    const grouped=new Map<string,import('../movement/types.js').InventoryMovement[]>();
    for(const movement of [...preCutover,...baselineMovements,...postCutover]){if(!movement.sn)continue;const sn=canonicalizeSn(movement.sn);grouped.set(sn,[...(grouped.get(sn)??[]),movement]);}
    const replayService=new DeterministicSnLifecycleReplayService(),replays=[...grouped.entries()].map(([sn,movements])=>replayService.replay(sn,movements));
    const raw=reconcileSnProjection(replays,target.map(item=>item.projection)),valid=reconcileSnProjection(replays,target.filter(item=>item.valid).map(item=>item.projection));
    return {replayInStock:raw.replayInStockCount,matched:raw.matched,rawMatchRate:rate(raw.matched,target.length),validEvidenceOnlyMatchRate:rate(valid.matched,target.filter(item=>item.valid).length),replayConflicts:raw.replayConflicts.length};
  }
}

export function draftMigrationManifest(input:{migrationId:string;cutoverDate:string;createdAt:string;physicalCount:number;currentProjectionCount:number;ledgerRecordCount:number;candidates:readonly MigrationBaselineCandidate[]}):MigrationManifest{
  return {migrationId:input.migrationId,cutoverDate:input.cutoverDate,createdAt:input.createdAt,sourceSummary:{physicalCount:input.physicalCount,currentProjectionCount:input.currentProjectionCount,ledgerRecordCount:input.ledgerRecordCount},baselineCount:input.candidates.length,verifiedCount:input.candidates.filter(item=>item.verificationStatus==='VERIFIED').length,reviewRequiredCount:input.candidates.filter(item=>item.verificationStatus==='REVIEW_REQUIRED').length,conflictCount:input.candidates.filter(item=>item.verificationStatus==='CONFLICT').length,approvalStatus:'DRAFT'};
}

function usableCandidate(item:MigrationBaselineCandidate):boolean{return Boolean(item.sku&&item.location&&STOCK_CONDITIONS.includes(item.stockCondition as StockCondition));}
function baselineMovement(item:MigrationBaselineCandidate,index:number):import('../movement/types.js').InventoryMovement{return {movementId:item.baselineId,identityAuthority:'DERIVED',origin:'LEGACY_MIGRATION',replayEligibility:'MIGRATION_BASELINE',sourceSequence:-1_000_000+index,sourceRecordRef:{sourceSystem:'FEISHU_LEDGER',sourceType:'OPERATIONAL_LEDGER',internalRecordKey:`migration-candidate:${item.baselineId}`},businessDate:item.baselineDate,ledgerAction:'期初库存',sku:item.sku,...(item.displayName?{displayName:item.displayName}:{}),sn:item.sn,qty:1,stockConditionAfter:item.stockCondition as StockCondition,toLocation:item.location,inventoryEffect:'INCREASE',verificationStatus:'VERIFIED'};}
function targetProjection(items:BaselineReplaySimulationInput['physicalTarget']):Array<{projection:SerializedInventoryProjection;valid:boolean}>{return items.map(item=>{const condition=STOCK_CONDITIONS.includes(item.stockCondition as StockCondition)?item.stockCondition as StockCondition:'UNKNOWN' as StockCondition,location=normalizeLocation(item.location)||'UNKNOWN';const projection={sn:item.sn,sku:item.sku?.trim()||'UNKNOWN',location,stockCondition:condition};return {projection,valid:Boolean(/^[A-Z0-9]{8,}$/.test(item.sn.trim().toUpperCase())&&item.sku?.trim()&&item.location?.trim()&&STOCK_CONDITIONS.includes(item.stockCondition as StockCondition))};});}
function rate(matched:number,total:number):number{return total?matched/total:1;}
