import { canonicalizeSn, normalizeSn } from '../../snResolver/resolver.js';
import { distinctNonBlank, validatePhysicalEvidence } from './baselineValidation.js';
import { normalizeLocation, normalizeSku, normalizeStockCondition } from './normalization.js';
import type { BaselineCandidateInput, BaselineCandidateService, BaselineCandidateStatus, BaselineEvidence, BaselineEvidenceSource, BaselineWarningCode, CurrentEvidenceScope, EvidenceAuthority, MigrationBaselineCandidate } from './types.js';

/** Builds review-only candidates. Historical ledger evidence never overrides physical/current state. */
export class DeterministicBaselineCandidateService implements BaselineCandidateService {
  constructor(private readonly input:BaselineCandidateInput){}

  async build():Promise<MigrationBaselineCandidate[]>{
    const physicalGroups=groupByCanonical(this.input.physical),currentGroups=groupByCanonical(this.input.currentInventory);
    const productsBySku=new Map(this.input.products.map(item=>[normalizeSku(item.sku),item]));
    const ledgerGroups=groupByCanonical(this.input.ledger.filter(item=>item.sn).map(item=>({...item,sn:item.sn!})));
    const ordered=[...this.input.physical].sort((left,right)=>canonicalizeSn(left.sn).localeCompare(canonicalizeSn(right.sn))||left.sn.localeCompare(right.sn));

    return ordered.map((physical,index)=>{
      const canonicalSn=canonicalizeSn(physical.sn),normalizedSn=normalizeSn(physical.sn),currentRows=currentGroups.get(canonicalSn)??[];
      const directCurrent=currentRows.filter(item=>scope(item)==='SN_EXACT'),aggregateCurrent=currentRows.filter(item=>scope(item)==='AGGREGATE_BUCKET');
      const current=directCurrent[0]??aggregateCurrent[0],currentEvidenceScope:CurrentEvidenceScope=directCurrent.length?'SN_EXACT':aggregateCurrent.length?'AGGREGATE_BUCKET':'NONE';
      const latest=latestLedger(ledgerGroups.get(canonicalSn)??[]),validation=validatePhysicalEvidence(physical),blockers=[...validation.issues],warnings:BaselineWarningCode[]=[],evidence:BaselineEvidence[]=[];
      addEvidence(evidence,'PHYSICAL_SN','CURRENT_DIRECT',physical,'HIGH');
      for(const item of directCurrent)addEvidence(evidence,'CURRENT_INVENTORY_PROJECTION','CURRENT_DIRECT',item,'HIGH');
      for(const item of aggregateCurrent){addEvidence(evidence,'CURRENT_INVENTORY_PROJECTION','CURRENT_AGGREGATE',item,'MEDIUM');evidence.push({source:'CURRENT_INVENTORY_PROJECTION',authority:'CURRENT_AGGREGATE',field:'CURRENT_STATE',value:'AGGREGATE_BUCKET',confidence:'MEDIUM'});}
      if(latest)addEvidence(evidence,'OPERATIONAL_LEDGER','HISTORICAL',{sku:latest.sku,location:ledgerLocation(latest),stockCondition:latest.stockCondition},'LOW');

      const sku=first(physical.sku,current?.sku,latest?.sku),location=firstLocation(physical.location,current?.location,ledgerLocation(latest)),condition=firstCondition(physical.stockCondition,current?.stockCondition,latest?.stockCondition);
      const product=sku?productsBySku.get(normalizeSku(sku)):undefined;
      if(product){evidence.push({source:'PRODUCT_MASTER',authority:'REFERENCE',field:'SKU',value:product.sku,confidence:'HIGH'});if(product.displayName)evidence.push({source:'PRODUCT_MASTER',authority:'REFERENCE',field:'DISPLAY_NAME',value:product.displayName,confidence:'HIGH'});}else if(sku)blockers.push('MANUAL_REVIEW');

      // Only physical + SN-exact current evidence can establish a hard current-state conflict.
      if(directCurrent.length){directConflict(blockers,'SKU_CONFLICT',[physical.sku,...directCurrent.map(item=>item.sku)],normalizeSku);directConflict(blockers,'LOCATION_CONFLICT',[physical.location,...directCurrent.map(item=>item.location)],normalizeLocation);directConflict(blockers,'CONDITION_CONFLICT',[physical.stockCondition,...directCurrent.map(item=>item.stockCondition)],normalizeStockCondition);}
      if(latest){if(differs(sku,latest.sku,normalizeSku))warnings.push('HISTORICAL_SKU_MISMATCH');if(differs(location,ledgerLocation(latest),normalizeLocation))warnings.push('HISTORICAL_LOCATION_MISMATCH');if(differs(condition,latest.stockCondition,normalizeStockCondition))warnings.push('HISTORICAL_CONDITION_MISMATCH');}

      if((physicalGroups.get(canonicalSn)?.length??0)>1)blockers.push('DUPLICATE_SN');
      if(!sku)blockers.push('MISSING_SKU');if(!location)blockers.push('MISSING_LOCATION');if(!condition)blockers.push('INVALID_CONDITION');
      const usedLegacy=Boolean((!physical.sku&&!current?.sku&&latest?.sku)||(!physical.location&&!current?.location&&ledgerLocation(latest))||(!normalizeStockCondition(physical.stockCondition)&&!normalizeStockCondition(current?.stockCondition)&&normalizeStockCondition(latest?.stockCondition)));
      if(usedLegacy)blockers.push('LEGACY_ONLY');
      if(validation.quality!=='VALID'&&!current&&!latest)blockers.push('NO_CURRENT_EVIDENCE');

      const blockingIssues=unique(blockers),hasConflict=blockingIssues.some(item=>item.endsWith('_CONFLICT')||item==='DUPLICATE_SN');
      const verificationStatus=hasConflict?'CONFLICT':blockingIssues.length?'REVIEW_REQUIRED':'VERIFIED';
      const physicalComplete=validation.quality==='VALID',hasProduct=Boolean(product),hasExactAgreement=directCurrent.length>0&&!hasConflict;
      const confidence=hasConflict?'CONFLICT':physicalComplete&&hasProduct&&hasExactAgreement?'HIGH':physicalComplete&&hasProduct?'MEDIUM':'LOW';
      const baselineId=`BASE-${this.input.baselineDate.replaceAll('-','')}-${String(index+1).padStart(6,'0')}`;
      return {baselineId,sn:normalizedSn,canonicalSn,sku,location,stockCondition:condition,baselineDate:this.input.baselineDate,evidence,verificationStatus,reviewIssues:blockingIssues,blockingIssues,warnings:unique(warnings),confidence,candidateStatus:primaryStatus(blockingIssues),physicalEvidenceQuality:validation.quality,currentEvidenceScope,candidateFingerprint:fingerprint(canonicalSn,sku,location,condition,this.input.baselineDate),reviewState:reviewState({verificationStatus,sku,location,condition,currentEvidenceScope,blockingIssues}),candidateOnly:true,...(product?.displayName?{displayName:product.displayName}:{})};
    });
  }
}

function groupByCanonical<T extends {sn:string}>(items:readonly T[]):Map<string,T[]>{const result=new Map<string,T[]>();for(const item of items){const key=canonicalizeSn(item.sn);result.set(key,[...(result.get(key)??[]),item]);}return result;}
function latestLedger<T extends {businessDate:string;sourceSequence:number}>(items:readonly T[]):T|undefined{return [...items].sort((a,b)=>a.businessDate.localeCompare(b.businessDate)||a.sourceSequence-b.sourceSequence).at(-1);}
function ledgerLocation(item:{action?:string;fromLocation?:string;toLocation?:string}|undefined):string|undefined{return item?.action==='出库'||item?.action==='库存调减'?item.fromLocation:item?.toLocation??item?.fromLocation;}
function scope(item:{evidenceScope?:CurrentEvidenceScope}):CurrentEvidenceScope{return item.evidenceScope??'SN_EXACT';}
function addEvidence(evidence:BaselineEvidence[],source:BaselineEvidenceSource,authority:EvidenceAuthority,item:{sku?:string|undefined;location?:string|undefined;stockCondition?:string|undefined},confidence:'HIGH'|'MEDIUM'|'LOW'){if(item.sku)evidence.push({source,authority,field:'SKU',value:item.sku,confidence});if(item.location)evidence.push({source,authority,field:'LOCATION',value:item.location,confidence});if(item.stockCondition)evidence.push({source,authority,field:'STOCK_CONDITION',value:item.stockCondition,confidence});}
function directConflict(issues:BaselineCandidateStatus[],code:BaselineCandidateStatus,values:readonly (string|undefined)[],normalize:(value:string|undefined)=>string|undefined){if(distinctNonBlank(values.map(normalize)).length>1)issues.push(code);}
function differs(left:string|undefined,right:string|undefined,normalize:(value:string|undefined)=>string|undefined):boolean{const a=normalize(left),b=normalize(right);return Boolean(a&&b&&a!==b);}
function first(...values:Array<string|undefined>):string{return values.find(value=>Boolean(value?.trim()))?.trim()??'';}
function firstLocation(...values:Array<string|undefined>):string{return values.map(normalizeLocation).find(Boolean)??'';}
function firstCondition(...values:Array<string|undefined>):string{return values.map(normalizeStockCondition).find(Boolean)??'';}
function unique<T>(items:readonly T[]):T[]{return [...new Set(items)];}
function primaryStatus(issues:readonly BaselineCandidateStatus[]):BaselineCandidateStatus{return ['DUPLICATE_SN','SKU_CONFLICT','LOCATION_CONFLICT','CONDITION_CONFLICT','MISSING_SKU','MISSING_LOCATION','INVALID_CONDITION','LEGACY_ONLY','NO_CURRENT_EVIDENCE','MANUAL_REVIEW'].find(item=>issues.includes(item as BaselineCandidateStatus)) as BaselineCandidateStatus??'READY';}
function fingerprint(canonicalSn:string,sku:string,location:string,condition:string,date:string):string{return createHash('sha256').update([canonicalSn,normalizeSku(sku)??'',normalizeLocation(location)??'',condition,date].join('|')).digest('hex');}
function reviewState(input:{verificationStatus:string;sku:string;location:string;condition:string;currentEvidenceScope:CurrentEvidenceScope;blockingIssues:readonly BaselineCandidateStatus[]}):import('./types.js').BaselineReviewState{const unresolvedFields:Array<'sku'|'location'|'stockCondition'>=[];if(!input.sku)unresolvedFields.push('sku');if(!input.location)unresolvedFields.push('location');if(!input.condition)unresolvedFields.push('stockCondition');const reasons=[] as import('./types.js').ReviewReasonCode[];if(input.currentEvidenceScope==='NONE')reasons.push('NO_INDEPENDENT_CURRENT_EVIDENCE');if(input.blockingIssues.includes('MISSING_SKU'))reasons.push('SKU_SUPPORTED_BY_LEGACY_ONLY');if(input.blockingIssues.includes('INVALID_CONDITION'))reasons.push('CONDITION_SUPPORTED_BY_LEGACY_ONLY');if(input.verificationStatus!=='VERIFIED')reasons.push('MANUAL_DECISION_REQUIRED');const resolution:import('./types.js').BaselineReviewResolution=input.verificationStatus==='VERIFIED'?'READY_FOR_APPROVAL':unresolvedFields.length?'UNRESOLVED':'REVIEW_REQUIRED';return {resolution,resolvedFields:{...(input.sku?{sku:{value:input.sku,source:'PHYSICAL_SN' as const,confidence:'HIGH' as const}}:{}),...(input.location?{location:{value:input.location,source:'PHYSICAL_SN' as const,confidence:'HIGH' as const}}:{}),...(input.condition?{stockCondition:{value:input.condition,source:'PHYSICAL_SN' as const,confidence:'HIGH' as const}}:{})},unresolvedFields,reviewReasonCodes:[...new Set(reasons)]};}
import { createHash } from 'node:crypto';
