import type { InventoryCandidate } from '../contracts.js';
import type { InventoryMovement, MovementValidationIssue } from '../../domain/movement/types.js';
import { DeterministicSnLifecycleReplayService } from '../../domain/sn/snLifecycleReplay.js';
import type { SnLifecycleReplayResult } from '../../domain/sn/types.js';
import { canonicalizeSn } from '../../snResolver/resolver.js';
import { reconcileSnProjection, serializedProjectionFromInventory, type SnProjectionReconciliation } from './snProjectionReconciliation.js';

export interface SnReplayAuditReport extends SnProjectionReconciliation {
  matchRate:number;historicalEvidenceCount:number;migrationBaselineCount:number;unknownActionCount:number;
  issuesByCode:Record<string,number>;
  findings:Array<{code:string;severity:string;sn?:string;movementId?:string;evidence:string}>;
}

export function buildSnReplayAudit(
  movements:readonly InventoryMovement[],currentInventory:readonly InventoryCandidate[],projectionIssues:readonly MovementValidationIssue[]=[],unknownActionCount=0,
):SnReplayAuditReport{
  const grouped=new Map<string,InventoryMovement[]>();
  for(const movement of movements){if(!movement.sn)continue;const key=canonicalizeSn(movement.sn);grouped.set(key,[...(grouped.get(key)??[]),movement]);}
  const replayService=new DeterministicSnLifecycleReplayService();
  const replays:SnLifecycleReplayResult[]=[...grouped.entries()].map(([sn,items])=>replayService.replay(sn,items));
  const reconciliation=reconcileSnProjection(replays,serializedProjectionFromInventory(currentInventory));
  const issues=dedupeIssues([...projectionIssues,...replays.flatMap(item=>item.issues)]),issuesByCode:Record<string,number>={};
  for(const issue of issues)issuesByCode[issue.code]=(issuesByCode[issue.code]??0)+1;
  return {...reconciliation,matchRate:reconciliation.currentProjectionCount?reconciliation.matched/reconciliation.currentProjectionCount:1,
    historicalEvidenceCount:movements.filter(item=>item.replayEligibility==='HISTORICAL_EVIDENCE_ONLY').length,
    migrationBaselineCount:movements.filter(item=>item.replayEligibility==='MIGRATION_BASELINE').length,unknownActionCount,issuesByCode,
    findings:issues.map(issue=>({code:issue.code,severity:issue.severity,...(issue.sn?{sn:issue.sn}:{}),...(issue.movementId?{movementId:issue.movementId}:{}),evidence:issue.message}))};
}
function dedupeIssues(items:readonly MovementValidationIssue[]):MovementValidationIssue[]{const seen=new Set<string>();return items.filter(item=>{const key=`${item.code}|${item.movementId??''}|${item.sn??''}`;if(seen.has(key))return false;seen.add(key);return true;});}
