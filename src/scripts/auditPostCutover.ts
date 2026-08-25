import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditPostCutover } from '../domain/migration/postCutoverAudit.js';

// Manual local audit only: it never reaches Feishu and requires a freshly generated local artifact.
const artifactPath=join(process.cwd(),'artifacts','migration-baseline-candidates.json');
const artifact=JSON.parse(readFileSync(artifactPath,'utf8')) as {cutoverAnalysis:{configuredCandidateDate:string};simulation:{postCutoverMovements:number}};
const result=artifact.simulation.postCutoverMovements===0?auditPostCutover([],artifact.cutoverAnalysis.configuredCandidateDate):{status:'POST_CUTOVER_AUDIT_REQUIRES_FRESH_MOVEMENT_INPUT',reason:'ARTIFACT_HAS_POST_CUTOVER_MOVEMENTS'};
console.log(JSON.stringify({executed:true,mode:'READ_ONLY_AUDIT',writesAttempted:0,...result},null,2));
