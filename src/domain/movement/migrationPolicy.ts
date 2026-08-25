import type { OperationalLedgerRecord, ReplayEligibility } from './types.js';

export interface MigrationPolicy {
  readonly operationalCutoff: string | undefined;
  classify(record: OperationalLedgerRecord): ReplayEligibility;
}

export class DefaultMigrationPolicy implements MigrationPolicy {
  constructor(readonly operationalCutoff: string | undefined = undefined) {}
  classify(record: OperationalLedgerRecord): ReplayEligibility {
    if(/\[历史追踪\|不计实时库存\]/.test(record.remark??''))return 'HISTORICAL_EVIDENCE_ONLY';
    if(record.sourceBatch?.toUpperCase().includes('HISTORICAL_ONLY'))return 'HISTORICAL_EVIDENCE_ONLY';
    if(this.operationalCutoff&&record.origin==='LEGACY_MIGRATION'&&record.businessDate&&record.businessDate<this.operationalCutoff)return 'HISTORICAL_EVIDENCE_ONLY';
    return 'CURRENT_STATE';
  }
}
