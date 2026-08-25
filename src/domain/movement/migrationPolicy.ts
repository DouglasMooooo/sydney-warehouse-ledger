import type { OperationalLedgerRecord, ReplayEligibility } from './types.js';

export interface MigrationPolicy {
  readonly operationalCutoff: string | undefined;
  classify(record: OperationalLedgerRecord): ReplayEligibility;
}
export const FEISHU_OPERATIONAL_SOURCE_BATCHES=['FEISHU_OPERATIONAL_LEDGER'] as const;

export class DefaultMigrationPolicy implements MigrationPolicy {
  constructor(readonly operationalCutoff: string | undefined = undefined,private readonly operationalSourceBatches:readonly string[] = []) {}
  classify(record: OperationalLedgerRecord): ReplayEligibility {
    if(/\[历史追踪\|不计实时库存\]/.test(record.remark??''))return 'HISTORICAL_EVIDENCE_ONLY';
    const batch=(record.sourceBatch??'').toUpperCase();
    if(batch.includes('HISTORICAL_ONLY'))return 'HISTORICAL_EVIDENCE_ONLY';
    if(['OPENING_BALANCE','CURRENT_STOCK_BASELINE','MIGRATION_BASELINE'].some(marker=>batch.includes(marker)))return 'MIGRATION_BASELINE';
    if(this.operationalCutoff&&record.origin==='LEGACY_MIGRATION'&&record.businessDate&&record.businessDate<this.operationalCutoff)return 'HISTORICAL_EVIDENCE_ONLY';
    if(this.operationalSourceBatches.some(value=>batch===value.toUpperCase()))return 'CURRENT_STATE';
    if(record.origin==='LEGACY_MIGRATION')return 'HISTORICAL_EVIDENCE_ONLY';
    return 'CURRENT_STATE';
  }
}
