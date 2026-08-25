import type { CandidateCutoverDate, CutoverPolicy } from './types.js';

export function createCutoverPolicy(cutoverDate:string):CutoverPolicy{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)||Number.isNaN(Date.parse(`${cutoverDate}T00:00:00Z`)))throw new TypeError('INVALID_CUTOVER_DATE');
  return {cutoverDate,preCutoverMode:'HISTORICAL_EVIDENCE_ONLY',baselineMode:'MIGRATION_BASELINE',postCutoverMode:'CURRENT_STATE',sameDayBoundary:'BASELINE_AT_START_POST_CUTOVER_AFTER_DATE'};
}

export function analyzeCutoverDates(input:{physicalSnapshotDate?:string;migrationCompletionDate?:string;firstReliableSystemNativeDate?:string}):CandidateCutoverDate[]{
  const result:CandidateCutoverDate[]=[];
  if(input.physicalSnapshotDate)result.push({date:input.physicalSnapshotDate,basis:'PHYSICAL_SNAPSHOT',dataCompleteness:'MEDIUM',movementContinuity:'LOW',currentStockCoverage:'HIGH',recommended:true,risk:'Same-day movements must be frozen or separately reviewed; only later business dates are replayed.'});
  if(input.migrationCompletionDate)result.push({date:input.migrationCompletionDate,basis:'MIGRATION_COMPLETION',dataCompleteness:'UNKNOWN',movementContinuity:'MEDIUM',currentStockCoverage:'MEDIUM',recommended:false,risk:'Completion date does not prove that the physical snapshot was synchronized.'});
  if(input.firstReliableSystemNativeDate)result.push({date:input.firstReliableSystemNativeDate,basis:'FIRST_RELIABLE_SYSTEM_NATIVE',dataCompleteness:'LOW',movementContinuity:'HIGH',currentStockCoverage:'LOW',recommended:false,risk:'Requires an earlier reviewed baseline to explain stock already present.'});
  return result;
}
