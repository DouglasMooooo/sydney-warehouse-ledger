import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { AI_CAPABILITIES, AiCapabilityError, requireAiCapability } from '../src/ai/capabilities.js';
import { authenticateAiPrincipal, LEGACY_SERVICE_CAPABILITIES } from '../src/ai/principal.js';
import { operationalLedgerProvenance, workflowDefinitionProvenance } from '../src/ai/provenance.js';
import { assertAiSafePayload, UnsafeAiPayloadError } from '../src/ai/sanitize.js';
import { withAiQueryRoute } from '../src/ai/queryRoute.js';
import { LiveInventoryQueryService } from '../src/application/queries/inventoryQueryService.js';
import { LiveMovementQueryService,ProjectedMovementRepository } from '../src/application/queries/movementQueryService.js';
import { ReplaySnContextService } from '../src/application/queries/snContextService.js';
import { CombinedShQueryService, isOperationalShNumber } from '../src/application/queries/shQueryService.js';
import { parseLegacyInventoryIntent } from '../src/application/queries/legacyAiQueryService.js';
import { ACTION_RULES } from '../src/application/inventoryActionEngine.js';
import { WORKFLOW_DEFINITIONS } from '../src/application/knowledge/workflowDefinitions.js';
import { WORKFLOW_KNOWLEDGE_SOURCE } from '../src/application/knowledge/knowledgeSource.js';

test('service token establishes an explicit least-privilege principal and invalid bearer fails closed', () => {
  const token='s'.repeat(40), request=new Request('https://warehouse.test/api/ai/inventory',{headers:{authorization:`Bearer ${token}`}});
  const principal=authenticateAiPrincipal(request,{WAREHOUSE_AI_READ_TOKEN:token},new Date('2026-08-25T01:00:00Z'));
  assert.equal(principal.principalId,'legacy-ai-service'); assert.equal(principal.principalType,'SERVICE');
  assert.deepEqual(principal.capabilities,LEGACY_SERVICE_CAPABILITIES); assert(!principal.capabilities.includes('warehouse.recommend'));
  assert.throws(()=>authenticateAiPrincipal(new Request('https://warehouse.test',{headers:{authorization:'Bearer wrong'}}),{WAREHOUSE_AI_READ_TOKEN:token}),/Invalid AI service credential/);
});

test('capability enforcement is central and no write or wildcard capability exists',()=>{
  assert.throws(()=>requireAiCapability({capabilities:['warehouse.sop.read']},'warehouse.inventory.read'),AiCapabilityError);
  assert.doesNotThrow(()=>requireAiCapability({capabilities:['warehouse.sop.read']},'warehouse.sop.read'));
  assert(AI_CAPABILITIES.every(value=>!value.includes('write')&&!value.includes('execute')&&!value.includes('*')));
});

test('route helper returns 403 without required capability and 200 with SOP read',async()=>{
  const old=process.env.WAREHOUSE_AI_READ_TOKEN; process.env.WAREHOUSE_AI_READ_TOKEN='t'.repeat(40);
  try{
    const denied=withAiQueryRoute({capability:'warehouse.recommend',queryType:'WORKFLOW',async handler(){throw new Error('must not run');}});
    const deniedResponse=await denied(new Request('https://warehouse.test',{headers:{authorization:`Bearer ${'t'.repeat(40)}`}}));
    assert.equal(deniedResponse.status,403); assert.equal((await deniedResponse.json()).error.code,'AI_CAPABILITY_REQUIRED');
    const allowed=withAiQueryRoute({capability:'warehouse.sop.read',queryType:'WORKFLOW',async handler(){return {data:{id:'MOVE'},provenance:workflowDefinitionProvenance('v1'),dataSources:['WORKFLOW_DEFINITION']};}});
    const response=await allowed(new Request('https://warehouse.test',{headers:{authorization:`Bearer ${'t'.repeat(40)}`}}));
    const body=await response.json(); assert.equal(response.status,200); assert.equal(body.data.id,'MOVE'); assert(body.requestId);
  }finally{if(old===undefined)delete process.env.WAREHOUSE_AI_READ_TOKEN;else process.env.WAREHOUSE_AI_READ_TOKEN=old;}
});

test('inventory query groups the current business projection without sheet coordinates',async()=>{
  const service=new LiveInventoryQueryService({readCurrentInventory:async()=>[
    {sku:'SKU-1',model:'H3',location:'R1-1-1-L',container:'C1',availableQty:2,condition:'新机'},
    {sku:'SKU-1',model:'H3',location:'R1-1-1-L',container:'C2',availableQty:3,condition:'新机'},
    {sku:'SKU-1',model:'H3',location:'R1-1-1-R',availableQty:1,condition:'维修良品'},
  ]});
  const result=await service.search({sku:'sku-1',stockCondition:'新机'});
  assert.equal(result.items.length,1); assert.equal(result.items[0]?.totalQty,5);
  assert.deepEqual(result.items[0]?.locations,[{location:'R1-1-1-L',qty:5,containers:['C1','C2']}]);
  assertAiSafePayload(result);
});

test('provenance is mandatory and truthfully marks ERP/WMS disconnected',()=>{
  for(const value of [operationalLedgerProvenance('2026-08-25T00:00:00Z'),workflowDefinitionProvenance('v1')]){
    assert(value.generatedAt);assert(value.dataCutoff);assert(value.primarySource);assert(value.verification);
    assert.equal(value.verification.erp,'NOT_CONNECTED');assert.equal(value.verification.wms,'NOT_CONNECTED');
  }
});

test('response sanitizer rejects all forbidden infrastructure and credential fields',()=>{
  for(const key of ['spreadsheetId','sheetId','rowNumber','a1Range','formula','tenantToken','authorization','accessToken','refreshToken'])
    assert.throws(()=>assertAiSafePayload({data:{nested:{[key]:'secret'}}}),UnsafeAiPayloadError);
  assert.doesNotThrow(()=>assertAiSafePayload({data:{sku:'SKU-1',locations:[{location:'R1'}]}}));
});

test('SH rules keep TH historical references out of operational confirmation',async()=>{
  assert.equal(isOperationalShNumber('SH-2608-00184741'),true);assert.equal(isOperationalShNumber('TH-2608-00184741'),false);
  const service=new CombinedShQueryService([{resolveBySn:async()=>[
    {shNo:'TH-1',source:'LEGACY_EVIDENCE',confidence:'CANDIDATE',operationallyValid:true,evidence:['legacy']},
    {shNo:'SH-1',source:'OPERATIONAL_LEDGER',confidence:'EXACT',operationallyValid:false,evidence:['ledger']},
  ]}]);
  const result=await service.resolveBySn('SN1'); assert.deepEqual(result.map(item=>item.operationallyValid),[false,true]);
});

test('workflow definitions correspond to Action Engine and Return Repair requires confirmed SH',()=>{
  const effect={none:'NONE',increase:'INCREASE',decrease:'DECREASE',transfer:'TRANSFER'} as const;
  for(const knowledge of Object.values(WORKFLOW_DEFINITIONS)){
    const rule=ACTION_RULES[knowledge.id]; assert(rule);assert.equal(knowledge.ledgerAction,rule.ledgerAction);
    assert.equal(knowledge.inventoryEffect,knowledge.id==='REPAIR_COMPLETE'?'STATE_TRANSITION':effect[rule.inventoryEffect]);
    assert.equal(knowledge.humanConfirmationRequired,true);
    assert.equal(knowledge.requiredFields.includes('sh')||knowledge.requiredFields.includes('confirmedSh'),rule.shRequired);
  }
  const returned=WORKFLOW_DEFINITIONS.RETURN_REPAIR;
  assert(returned.requiredFields.includes('sn'));assert(returned.requiredFields.includes('confirmedSh'));
  assert.deepEqual(returned.defaults,{targetLocation:'REPAIR-01',stockCondition:'待修',qty:'1'});
  assert.equal(returned.availability,'DEPENDENCY_PENDING');assert.equal(WORKFLOW_KNOWLEDGE_SOURCE.kind,'WORKFLOW_DEFINITION');
});

test('movement foundation is internal while legacy NL intent never guesses',async()=>{
  const repository=new ProjectedMovementRepository({readLedgerRecords:async()=>[]});
  assert.deepEqual(await new LiveMovementQueryService(repository).search({sn:'SN1'}),{capabilityState:'AVAILABLE',items:[],issues:[]});
  const sn=await new ReplaySnContextService(repository).get('SN1');assert.equal(sn.replayStatus,'VERIFIED');assert.equal(sn.currentState.status,'UNKNOWN');
  assert.deepEqual(parseLegacyInventoryIntent('R1-1-1-L 新机库存'),{stockCondition:'新机',location:'R1-1-1-L'});
  assert.throws(()=>parseLegacyInventoryIntent('请分析这个问题'),/Ambiguous legacy query/);
  assert.throws(()=>parseLegacyInventoryIntent('查询 SN 生命周期'),/unavailable model/);
});

test('AI architecture cannot import writers, execution layer, or cell-level mutation routes',()=>{
  const files=['app/api/ai','src/ai','src/application/queries'].flatMap(allFiles).filter(path=>/\.tsx?$/.test(path));
  const forbidden=['ledgerWriter','OpenApiLedgerWriter','prepareLedgerWrite','executeControlledLedgerOperation','writeLedger'];
  for(const path of files){const source=readFileSync(path,'utf8');const imports=[...source.matchAll(/(?:import|export)\s+[\s\S]*?from\s+['"]([^'"]+)['"]/g)].map(match=>match[1]??'');
    for(const value of forbidden)assert(!imports.some(item=>item.toLowerCase().includes(value.toLowerCase())),`${path} imports ${value}`);
    assert(!imports.some(item=>/(?:^|\/)mutation(?:\/|$)/i.test(item)),`${path} imports a mutation module`);
  }
});

function allFiles(directory:string):string[]{return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{const path=`${directory}/${entry.name}`;return entry.isDirectory()?allFiles(path):[path];});}
