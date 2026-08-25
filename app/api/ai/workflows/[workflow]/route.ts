import { getWorkflowKnowledge } from '../../../../../src/application/knowledge/workflowDefinitions';
import { WORKFLOW_KNOWLEDGE_SOURCE } from '../../../../../src/application/knowledge/knowledgeSource';
import { workflowDefinitionProvenance } from '../../../../../src/ai/provenance';
import { AiQueryError,withAiQueryRoute } from '../../../../../src/ai/queryRoute';
export const runtime='nodejs'; export const dynamic='force-dynamic';

export const GET=withAiQueryRoute({capability:'warehouse.sop.read',queryType:'WORKFLOW',async handler({request}){
  const workflow=decodeURIComponent(new URL(request.url).pathname.split('/').filter(Boolean).at(-1)??'');
  const data=getWorkflowKnowledge(workflow);
  if(!data)throw new AiQueryError('NOT_FOUND','Unknown workflow.');
  return {data,provenance:workflowDefinitionProvenance(WORKFLOW_KNOWLEDGE_SOURCE.version),entityType:'WORKFLOW',entityId:data.id,dataSources:['WORKFLOW_DEFINITION']};
}});
