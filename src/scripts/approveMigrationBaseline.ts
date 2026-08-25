import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateBaselineApproval, parseBaselineReviewCsv } from '../domain/migration/baselineReview.js';
import type { MigrationBaselineCandidate } from '../domain/migration/types.js';

// Dry-run only. It reads local review material and produces a local preview; no Feishu or baseline persistence path exists.
const dir=join(process.cwd(),'artifacts'),artifact=JSON.parse(readFileSync(join(dir,'migration-baseline-candidates.json'),'utf8')) as {cutoverAnalysis:{configuredCandidateDate:string};candidates:MigrationBaselineCandidate[]};
const parsed=parseBaselineReviewCsv(readFileSync(join(dir,'migration-baseline-review.csv'),'utf8'),artifact.candidates),gate=evaluateBaselineApproval(artifact.candidates,parsed.decisions,artifact.cutoverAnalysis.configuredCandidateDate);
const preview={mode:'DRY_RUN_ONLY',writesAttempted:0,approvalStatus:'REVIEWED_PREVIEW',wouldApprove:gate.eligible,parseErrors:parsed.errors,gate:{eligible:gate.eligible,approvedCount:gate.approvedCount,rejectedCount:gate.rejectedCount,deferredCount:gate.deferredCount,unresolvedCount:gate.unresolvedCount,blockers:gate.blockers},approvedRecords:gate.approvedRecords,rejectedRecords:gate.rejectedRecords,deferredRecords:gate.deferredRecords,reviewAudit:gate.reviewAudit};
mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'migration-baseline-approved-preview.json'),JSON.stringify(preview,null,2),'utf8');console.log(JSON.stringify({executed:true,...preview,approvedRecords:undefined,rejectedRecords:undefined,deferredRecords:undefined,reviewAudit:undefined},null,2));
