import { createHash } from 'node:crypto';
import type { BaselineReviewDecisionRecord, BulkApprovalScope, BulkBaselineApprovalCommand, BulkBaselineApprovalPreview, MigrationApprovalPrincipal, MigrationBaselineCandidate } from './types.js';

export const BASELINE_REVIEW_POLICY_VERSION='baseline-review-v1';

export class MigrationApprovalError extends Error {
  constructor(readonly code:'FORBIDDEN'|'STALE_REVIEW_BATCH'|'INVALID_BULK_APPROVAL_COMMAND') { super(code); }
}

export function createBulkApprovalScope(candidates:readonly MigrationBaselineCandidate[],cutoverDate:string):BulkApprovalScope {
  const eligible=eligibleCandidates(candidates),candidateFingerprints=eligible.map(item=>item.candidateFingerprint).sort(),payload={cutoverDate,baselineIds:eligible.map(item=>item.baselineId),candidateFingerprints,reviewPolicyVersion:BASELINE_REVIEW_POLICY_VERSION},hash=fingerprint(payload);
  return {reviewBatchFingerprint:`REVIEW-BATCH-${cutoverDate.replaceAll('-','')}-${hash.slice(0,12)}`,filter:{reviewResolution:'READY_FOR_APPROVAL',verificationStatus:'VERIFIED'},candidateFingerprints,candidateCount:eligible.length};
}

export function previewBulkBaselineApproval(input:{candidates:readonly MigrationBaselineCandidate[];cutoverDate:string;command:BulkBaselineApprovalCommand;principal:MigrationApprovalPrincipal;confirm:boolean}):BulkBaselineApprovalPreview {
  if(input.principal.principalType!=='HUMAN'||!input.principal.permissions.includes('MIGRATION_APPROVE'))throw new MigrationApprovalError('FORBIDDEN');
  if(input.command.decision!=='APPROVE_READY_SET'||!input.command.reviewer.trim()||!validDate(input.command.reviewedAt))throw new MigrationApprovalError('INVALID_BULK_APPROVAL_COMMAND');
  const scope=createBulkApprovalScope(input.candidates,input.cutoverDate);
  if(scope.reviewBatchFingerprint!==input.command.reviewBatchFingerprint)throw new MigrationApprovalError('STALE_REVIEW_BATCH');
  const idHash=fingerprint({reviewBatchFingerprint:scope.reviewBatchFingerprint,reviewer:input.command.reviewer.trim(),reviewedAt:input.command.reviewedAt,note:input.command.note??''}),bulkApprovalId=`BULK-APPROVAL-${input.command.reviewedAt.slice(0,10).replaceAll('-','')}-${idHash.slice(0,8)}`;
  const decisions=eligibleCandidates(input.candidates).map(candidate=>({decisionId:`DECISION-${fingerprint({bulkApprovalId,baselineId:candidate.baselineId,candidateFingerprint:candidate.candidateFingerprint}).slice(0,16)}`,baselineId:candidate.baselineId,candidateFingerprint:candidate.candidateFingerprint,decision:'APPROVE' as const,reviewer:input.command.reviewer.trim(),reviewedAt:input.command.reviewedAt,source:'BULK_APPROVAL' as const,bulkApprovalId,...(input.command.note?.trim()?{note:input.command.note.trim()}: {})} satisfies BaselineReviewDecisionRecord));
  return {mode:input.confirm?'CONFIRMED_LOCAL_ARTIFACT':'PREVIEW',writesAttempted:0,scope,bulkApprovalId,wouldApprove:decisions.length,writtenDecisions:input.confirm?decisions.length:0,bulkApprovedDecisions:decisions};
}

function eligibleCandidates(candidates:readonly MigrationBaselineCandidate[]):MigrationBaselineCandidate[]{return candidates.filter(item=>item.verificationStatus==='VERIFIED'&&item.reviewState.resolution==='READY_FOR_APPROVAL'&&item.blockingIssues.length===0&&item.candidateStatus==='READY').sort((a,b)=>a.baselineId.localeCompare(b.baselineId));}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function validDate(value:string):boolean{return !Number.isNaN(Date.parse(value));}
