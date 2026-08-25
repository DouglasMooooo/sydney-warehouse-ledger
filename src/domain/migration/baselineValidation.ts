import { STOCK_CONDITIONS, type StockCondition } from '../../config/controlledValues.js';
import { normalizeSn } from '../../snResolver/resolver.js';
import type { BaselineCandidateStatus, PhysicalEvidenceQuality, PhysicalSnSource } from './types.js';

export function validatePhysicalEvidence(item:PhysicalSnSource):{quality:PhysicalEvidenceQuality;issues:BaselineCandidateStatus[]}{
  const issues:BaselineCandidateStatus[]=[];const sn=normalizeSn(item.sn);
  if(!/^[A-Z0-9]{8,}$/.test(sn))issues.push('MANUAL_REVIEW');
  if(!item.sku?.trim())issues.push('MISSING_SKU');if(!item.location?.trim())issues.push('MISSING_LOCATION');
  if(!STOCK_CONDITIONS.includes(item.stockCondition?.trim() as StockCondition))issues.push('INVALID_CONDITION');
  return {quality:issues.length===0?'VALID':sn&&item.location?.trim()?'PARTIAL':'INVALID',issues};
}

export function distinctNonBlank(values:readonly (string|undefined)[]):string[]{return [...new Set(values.map(value=>value?.trim()).filter((value):value is string=>Boolean(value)))];}
