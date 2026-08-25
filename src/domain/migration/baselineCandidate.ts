import { STOCK_CONDITIONS, type StockCondition } from '../../config/controlledValues.js';
import { canonicalizeSn, normalizeSn } from '../../snResolver/resolver.js';
import { distinctNonBlank, validatePhysicalEvidence } from './baselineValidation.js';
import type { BaselineCandidateInput, BaselineCandidateService, BaselineCandidateStatus, BaselineEvidence, BaselineEvidenceSource, MigrationBaselineCandidate } from './types.js';

export class DeterministicBaselineCandidateService implements BaselineCandidateService {
  constructor(private readonly input:BaselineCandidateInput){}
  async build():Promise<MigrationBaselineCandidate[]>{
    const physicalGroups=groupByCanonical(this.input.physical),currentGroups=groupByCanonical(this.input.currentInventory),productBySku=new Map(this.input.products.map(item=>[norm(item.sku),item]));
    const ledgerGroups=groupByCanonical(this.input.ledger.filter(item=>item.sn).map(item=>({...item,sn:item.sn!})));
    const ordered=[...this.input.physical].sort((left,right)=>canonicalizeSn(left.sn).localeCompare(canonicalizeSn(right.sn))||left.sn.localeCompare(right.sn));
    return ordered.map((physical,index)=>{
      const canonicalSn=canonicalizeSn(physical.sn),normalizedSn=normalizeSn(physical.sn),current=currentGroups.get(canonicalSn)?.at(0),latest=latestLedger(ledgerGroups.get(canonicalSn)??[]),validation=validatePhysicalEvidence(physical);
      const issues=[...validation.issues],evidence:BaselineEvidence[]=[];addEvidence(evidence,'PHYSICAL_SN',physical,'HIGH');if(current){addEvidence(evidence,'CURRENT_INVENTORY_PROJECTION',current,'HIGH');if(current.evidenceScope)evidence.push({source:'CURRENT_INVENTORY_PROJECTION',field:'CURRENT_STATE',value:current.evidenceScope,confidence:'HIGH'});}if(latest)addEvidence(evidence,'OPERATIONAL_LEDGER',{sku:latest.sku,location:ledgerLocation(latest),stockCondition:latest.stockCondition},'LOW');
      const sku=first(physical.sku,current?.sku,latest?.sku),location=first(physical.location,current?.location,ledgerLocation(latest)),condition=firstValidCondition(physical.stockCondition,current?.stockCondition,latest?.stockCondition);
      const product=sku?productBySku.get(norm(sku)):undefined;if(product){evidence.push({source:'PRODUCT_MASTER',field:'SKU',value:product.sku,confidence:'HIGH'});if(product.displayName)evidence.push({source:'PRODUCT_MASTER',field:'DISPLAY_NAME',value:product.displayName,confidence:'HIGH'});}else if(sku)issues.push('MANUAL_REVIEW');
      conflict(issues,'SKU_CONFLICT',[physical.sku,current?.sku,latest?.sku]);conflict(issues,'LOCATION_CONFLICT',[physical.location,current?.location,ledgerLocation(latest)]);conflict(issues,'CONDITION_CONFLICT',[validCondition(physical.stockCondition),validCondition(current?.stockCondition),validCondition(latest?.stockCondition)]);
      if((physicalGroups.get(canonicalSn)?.length??0)>1)issues.push('DUPLICATE_SN');if(!sku)issues.push('MISSING_SKU');if(!location)issues.push('MISSING_LOCATION');if(!condition)issues.push('INVALID_CONDITION');
      const usedLegacy=Boolean((!physical.sku&&!current?.sku&&latest?.sku)||(!physical.location&&!current?.location&&ledgerLocation(latest))||(!validCondition(physical.stockCondition)&&!validCondition(current?.stockCondition)&&validCondition(latest?.stockCondition)));
      if(usedLegacy)issues.push('LEGACY_ONLY');if(validation.quality!=='VALID'&&!current&&!latest)issues.push('NO_CURRENT_EVIDENCE');
      const reviewIssues=unique(issues),hasConflict=reviewIssues.some(item=>item.endsWith('_CONFLICT')||item==='DUPLICATE_SN'),verificationStatus=hasConflict?'CONFLICT':reviewIssues.length?'REVIEW_REQUIRED':'VERIFIED';
      const physicalComplete=validation.quality==='VALID',currentComplete=Boolean(current?.sku&&current.location&&validCondition(current.stockCondition));
      const confidence=hasConflict?'CONFLICT':physicalComplete&&currentComplete&&product?'HIGH':physicalComplete&&product?'MEDIUM':'LOW';
      return {baselineId:`BASE-${this.input.baselineDate.replaceAll('-','')}-${String(index+1).padStart(6,'0')}`,sn:normalizedSn,canonicalSn,sku,location,stockCondition:condition,baselineDate:this.input.baselineDate,evidence,verificationStatus,reviewIssues,confidence,candidateStatus:primaryStatus(reviewIssues),physicalEvidenceQuality:validation.quality,candidateOnly:true,...(product?.displayName?{displayName:product.displayName}:{})};
    });
  }
}

function groupByCanonical<T extends {sn:string}>(items:readonly T[]):Map<string,T[]>{const result=new Map<string,T[]>();for(const item of items){const key=canonicalizeSn(item.sn);result.set(key,[...(result.get(key)??[]),item]);}return result;}
function latestLedger<T extends {businessDate:string;sourceSequence:number}>(items:readonly T[]):T|undefined{return [...items].sort((a,b)=>a.businessDate.localeCompare(b.businessDate)||a.sourceSequence-b.sourceSequence).at(-1);}
function ledgerLocation(item:{action?:string;fromLocation?:string;toLocation?:string}|undefined):string|undefined{return item?.action==='出库'||item?.action==='库存调减'?item.fromLocation:item?.toLocation??item?.fromLocation;}
function addEvidence(evidence:BaselineEvidence[],source:BaselineEvidenceSource,item:{sku?:string|undefined;location?:string|undefined;stockCondition?:string|undefined},confidence:'HIGH'|'MEDIUM'|'LOW'){if(item.sku)evidence.push({source,field:'SKU',value:item.sku,confidence});if(item.location)evidence.push({source,field:'LOCATION',value:item.location,confidence});if(item.stockCondition)evidence.push({source,field:'STOCK_CONDITION',value:item.stockCondition,confidence});}
function conflict(issues:BaselineCandidateStatus[],code:BaselineCandidateStatus,values:readonly (string|undefined)[]){if(distinctNonBlank(values).length>1)issues.push(code);}
function first(...values:Array<string|undefined>):string{return values.find(value=>Boolean(value?.trim()))?.trim()??'';}
function validCondition(value:string|undefined):string|undefined{return STOCK_CONDITIONS.includes(value?.trim() as StockCondition)?value!.trim():undefined;}
function firstValidCondition(...values:Array<string|undefined>):StockCondition|string{return values.map(validCondition).find(Boolean)??'';}
function unique<T>(items:readonly T[]):T[]{return [...new Set(items)];}
function norm(value:string):string{return value.trim().toUpperCase();}
function primaryStatus(issues:readonly BaselineCandidateStatus[]):BaselineCandidateStatus{return ['DUPLICATE_SN','SKU_CONFLICT','LOCATION_CONFLICT','CONDITION_CONFLICT','MISSING_SKU','MISSING_LOCATION','INVALID_CONDITION','LEGACY_ONLY','NO_CURRENT_EVIDENCE','MANUAL_REVIEW'].find(item=>issues.includes(item as BaselineCandidateStatus)) as BaselineCandidateStatus??'READY';}
