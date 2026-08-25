import type { InventoryCandidate } from '../contracts.js';
import type { SnLifecycleReplayResult } from '../../domain/sn/types.js';
import type { MovementValidationIssue } from '../../domain/movement/types.js';
export interface SerializedInventoryProjection {sn:string;sku:string;location:string;stockCondition:InventoryCandidate['condition']}
export interface SnProjectionReconciliation {matched:number;missingFromReplay:string[];missingFromCurrentProjection:string[];stateConflicts:string[]}
export function serializedProjectionFromInventory(items:readonly InventoryCandidate[]):SerializedInventoryProjection[]{return items.filter((item):item is InventoryCandidate&{sn:string}=>Boolean(item.sn)).map(item=>({sn:item.sn,sku:item.sku,location:item.location,stockCondition:item.condition}));}
export function validateSerializedProjectionUniqueness(items:readonly SerializedInventoryProjection[]):MovementValidationIssue[]{
  const groups=new Map<string,SerializedInventoryProjection[]>();for(const item of items){const sn=norm(item.sn);groups.set(sn,[...(groups.get(sn)??[]),item]);}
  const issues:MovementValidationIssue[]=[];for(const [sn,records] of groups){if(records.length<2)continue;issues.push({code:'DUPLICATE_CURRENT_SN',severity:'CRITICAL',sn,message:'SN appears more than once in the current projection.'});
    if(new Set(records.map(item=>`${item.sku}|${item.location}|${item.stockCondition}`)).size>1)issues.push({code:'SN_MULTIPLE_CURRENT_STATES',severity:'CRITICAL',sn,message:'SN has multiple conflicting current states.'});}
  return issues;
}
export function reconcileSnProjection(replays:readonly SnLifecycleReplayResult[],projection:readonly SerializedInventoryProjection[]):SnProjectionReconciliation{
  const bySn=new Map<string,SerializedInventoryProjection[]>();for(const item of projection){const key=norm(item.sn);bySn.set(key,[...(bySn.get(key)??[]),item]);}
  const replayBySn=new Map(replays.map(item=>[norm(item.sn),item]));let matched=0;const missingFromReplay:string[]=[],missingFromCurrentProjection:string[]=[],stateConflicts:string[]=[];
  for(const [sn,items] of bySn){const replay=replayBySn.get(sn);if(items.length>1)stateConflicts.push(`${sn}:DUPLICATE_CURRENT_SN`);if(!replay||replay.currentState.status!=='IN_STOCK'){missingFromReplay.push(sn);continue;}
    const item=items[0]!;if(item.sku!==replay.currentState.sku||item.location!==replay.currentState.location||item.stockCondition!==replay.currentState.stockCondition)
      stateConflicts.push(`${sn}:REPLAY=${replay.currentState.sku}|${replay.currentState.location}|${replay.currentState.stockCondition};PROJECTION=${item.sku}|${item.location}|${item.stockCondition}`);else matched++;}
  for(const [sn,replay] of replayBySn)if(replay.currentState.status==='IN_STOCK'&&!bySn.has(sn))missingFromCurrentProjection.push(sn);
  return {matched,missingFromReplay:missingFromReplay.sort(),missingFromCurrentProjection:missingFromCurrentProjection.sort(),stateConflicts:stateConflicts.sort()};
}
function norm(value:string){return value.trim().toUpperCase().replace(/\s+/g,'');}
