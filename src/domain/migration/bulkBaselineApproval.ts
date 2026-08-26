import { createHash } from 'node:crypto';
import type { BaselineReviewDecisionRecord, BulkApprovalScope, BulkBaselineApprovalCommand, BulkBaselineApprovalPreview, LocalReviewDecisionArtifact, MigrationApprovalPrincipal, MigrationBaselineCandidate } from './types.js';

export const BASELINE_REVIEW_POLICY_VERSION='baseline-review-v1';

export class MigrationApprovalError extends Error {
  constructor(readonly code:'FORBIDDEN'|'STALE_REVIEW_BATCH'|'INVALID_BULK_APPROVAL_COMMAND'|'HUMAN_REVIEWER_REQUIRED'|'REVIEWER_PRINCIPAL_MISMATCH'|'DUPLICATE_REVIEW_BATCH'|`DUPLICATE_REVIEW_DECISION:${string}`) { super(code); }
}

export function createBulkApprovalScope(candidates:readonly MigrationBaselineCandidate[],cutoverDate:string):BulkApprovalScope {
  const eligible=eligibleCandidates(candidates),candidateRefs=eligible.map(item=>({baselineId:item.baselineId,candidateFingerprint:item.candidateFingerprint})),candidateFingerprints=candidateRefs.map(item=>item.candidateFingerprint).sort(),payload={cutoverDate,candidates:candidateRefs,reviewPolicyVersion:BASELINE_REVIEW_POLICY_VERSION},hash=fingerprint(payload);
  return {reviewBatchFingerprint:`REVIEW-BATCH-${cutoverDate.replaceAll('-','')}-${hash.slice(0,12)}`,filter:{reviewResolution:'READY_FOR_APPROVAL',verificationStatus:'VERIFIED'},candidateRefs,candidateFingerprints,candidateCount:eligible.length};
}

export function previewBulkBaselineApproval(input:{candidates:readonly MigrationBaselineCandidate[];cutoverDate:string;command:BulkBaselineApprovalCommand;principal:MigrationApprovalPrincipal;confirm:boolean}):BulkBaselineApprovalPreview {
  if(input.principal.principalType!=='HUMAN'||!input.principal.permissions.includes('MIGRATION_APPROVE'))throw new MigrationApprovalError('FORBIDDEN');
  const reviewer=input.command.reviewer.trim();
  if(input.command.decision!=='APPROVE_READY_SET'||!validIsoTimestamp(input.command.reviewedAt))throw new MigrationApprovalError('INVALID_BULK_APPROVAL_COMMAND');
  if(input.confirm&&(!reviewer||placeholderReviewer(reviewer)))throw new MigrationApprovalError('HUMAN_REVIEWER_REQUIRED');
  if(!reviewer)throw new MigrationApprovalError('INVALID_BULK_APPROVAL_COMMAND');
  if(!principalMatchesReviewer(input.principal,reviewer))throw new MigrationApprovalError('REVIEWER_PRINCIPAL_MISMATCH');
  const scope=createBulkApprovalScope(input.candidates,input.cutoverDate);
  if(scope.reviewBatchFingerprint!==input.command.reviewBatchFingerprint)throw new MigrationApprovalError('STALE_REVIEW_BATCH');
  const idHash=fingerprint({reviewBatchFingerprint:scope.reviewBatchFingerprint,reviewer,reviewedAt:input.command.reviewedAt,note:input.command.note??''}),bulkApprovalId=`BULK-APPROVAL-${input.command.reviewedAt.slice(0,10).replaceAll('-','')}-${idHash.slice(0,8)}`;
  const decisions=eligibleCandidates(input.candidates).map(candidate=>({decisionId:`DECISION-${fingerprint({bulkApprovalId,baselineId:candidate.baselineId,candidateFingerprint:candidate.candidateFingerprint}).slice(0,16)}`,baselineId:candidate.baselineId,candidateFingerprint:candidate.candidateFingerprint,decision:'APPROVE' as const,reviewer,reviewedAt:input.command.reviewedAt,source:'BULK_APPROVAL' as const,bulkApprovalId,...(input.command.note?.trim()?{note:input.command.note.trim()}: {})} satisfies BaselineReviewDecisionRecord));
  return {mode:input.confirm?'CONFIRMED_LOCAL_ARTIFACT':'PREVIEW',writesAttempted:0,scope,bulkApprovalId,wouldApprove:decisions.length,writtenDecisions:input.confirm?decisions.length:0,bulkApprovedDecisions:decisions};
}

// Pure validation before any artifact write. JSON is the audit source of truth; CSV is derived only after this succeeds.
export function prepareBulkApprovalArtifact(existing:LocalReviewDecisionArtifact|undefined,result:BulkBaselineApprovalPreview):LocalReviewDecisionArtifact {
  if(existing?.reviewBatchFingerprint===result.scope.reviewBatchFingerprint)throw new MigrationApprovalError('DUPLICATE_REVIEW_BATCH');
  const existingIds=new Set([...(existing?.bulkApprovedDecisions??[]),...(existing?.manualDecisions??[])].map(item=>item.baselineId));
  for(const item of result.bulkApprovedDecisions)if(existingIds.has(item.baselineId))throw new MigrationApprovalError(`DUPLICATE_REVIEW_DECISION:${item.baselineId}`);
  const first=result.bulkApprovedDecisions[0];
  return {reviewBatchFingerprint:result.scope.reviewBatchFingerprint,bulkApprovalId:result.bulkApprovalId,...(first?{reviewer:first.reviewer,reviewedAt:first.reviewedAt}:{}),bulkApprovedDecisions:[...(existing?.bulkApprovedDecisions??[]),...result.bulkApprovedDecisions],manualDecisions:[...(existing?.manualDecisions??[])]};
}

function eligibleCandidates(candidates:readonly MigrationBaselineCandidate[]):MigrationBaselineCandidate[]{return candidates.filter(item=>item.verificationStatus==='VERIFIED'&&item.reviewState.resolution==='READY_FOR_APPROVAL'&&item.blockingIssues.length===0&&item.candidateStatus==='READY').sort((a,b)=>a.baselineId.localeCompare(b.baselineId));}
function fingerprint(value:unknown):string{return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function validIsoTimestamp(value:string):boolean{return /^\d{4}-\d{2}-\d{2}T/.test(value)&&!Number.isNaN(Date.parse(value));}
function placeholderReviewer(value:string):boolean{return ['PREVIEW_HUMAN_REQUIRED','SYSTEM','AUTO','AI','UNKNOWN'].includes(value.trim().toUpperCase());}
function principalMatchesReviewer(principal:MigrationApprovalPrincipal,reviewer:string):boolean{if(principal.displayName!==undefined)return principal.displayName.trim()===reviewer;return principal.principalId===`cli:${reviewer}`;}
