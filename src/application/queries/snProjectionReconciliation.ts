import type { InventoryCandidate } from '../contracts.js';
import type { SnLifecycleReplayResult } from '../../domain/sn/types.js';
import type { MovementValidationIssue } from '../../domain/movement/types.js';
import { canonicalizeSn } from '../../snResolver/resolver.js';
export interface SerializedInventoryProjection {sn:string;sku:string;location:string;stockCondition:InventoryCandidate['condition']}
export interface SnProjectionReconciliation {
  currentProjectionCount:number;replayInStockCount:number;matched:number;
  missingFromReplay:string[];missingFromCurrentProjection:string[];
  locationMismatch:string[];conditionMismatch:string[];skuMismatch:string[];
  replayConflicts:string[];duplicateCurrentSn:string[];
}
export function serializedProjectionFromInventory(items:readonly InventoryCandidate[]):SerializedInventoryProjection[]{return items.filter((item):item is InventoryCandidate&{sn:string}=>Boolean(item.sn)).map(item=>({sn:item.sn,sku:item.sku,location:item.location,stockCondition:item.condition}));}
export function validateSerializedProjectionUniqueness(items:readonly SerializedInventoryProjection[]):MovementValidationIssue[]{
  const groups=new Map<string,SerializedInventoryProjection[]>();for(const item of items){const sn=norm(item.sn);groups.set(sn,[...(groups.get(sn)??[]),item]);}
  const issues:MovementValidationIssue[]=[];for(const [sn,records] of groups){if(records.length<2)continue;issues.push({code:'DUPLICATE_CURRENT_SN',severity:'CRITICAL',sn,message:'SN appears more than once in the current projection.'});
    if(new Set(records.map(item=>`${item.sku}|${item.location}|${item.stockCondition}`)).size>1)issues.push({code:'SN_MULTIPLE_CURRENT_STATES',severity:'CRITICAL',sn,message:'SN has multiple conflicting current states.'});}
  return issues;
}
export function reconcileSnProjection(replays:readonly SnLifecycleReplayResult[],projection:readonly SerializedInventoryProjection[]):SnProjectionReconciliation{
  const bySn=new Map<string,SerializedInventoryProjection[]>();for(const item of projection){const key=norm(item.sn);bySn.set(key,[...(bySn.get(key)??[]),item]);}
  const replayBySn=new Map(replays.map(item=>[norm(item.sn),item]));let matched=0;
  const missingFromReplay:string[]=[],missingFromCurrentProjection:string[]=[],locationMismatch:string[]=[],conditionMismatch:string[]=[],skuMismatch:string[]=[],replayConflicts:string[]=[],duplicateCurrentSn:string[]=[];
  for(const [sn,items] of bySn){const replay=replayBySn.get(sn);if(items.length>1)duplicateCurrentSn.push(sn);if(!replay||replay.currentState.status!=='IN_STOCK'){missingFromReplay.push(sn);continue;}
    const item=items[0]!;let exact=true;if(item.sku!==replay.currentState.sku){skuMismatch.push(sn);exact=false;}if(item.location!==replay.currentState.location){locationMismatch.push(sn);exact=false;}
    if(item.stockCondition!==replay.currentState.stockCondition){conditionMismatch.push(sn);exact=false;}if(exact&&items.length===1)matched++;}
  for(const [sn,replay] of replayBySn)if(replay.currentState.status==='IN_STOCK'&&!bySn.has(sn))missingFromCurrentProjection.push(sn);
  for(const [sn,replay] of replayBySn)if(replay.currentState.status==='CONFLICT')replayConflicts.push(sn);
  return {currentProjectionCount:projection.length,replayInStockCount:replays.filter(item=>item.currentState.status==='IN_STOCK').length,matched,
    missingFromReplay:sorted(missingFromReplay),missingFromCurrentProjection:sorted(missingFromCurrentProjection),locationMismatch:sorted(locationMismatch),
    conditionMismatch:sorted(conditionMismatch),skuMismatch:sorted(skuMismatch),replayConflicts:sorted(replayConflicts),duplicateCurrentSn:sorted(duplicateCurrentSn)};
}
function norm(value:string){return canonicalizeSn(value.trim().toUpperCase().replace(/\s+/g,''));}
function sorted(values:string[]){return [...new Set(values)].sort();}
