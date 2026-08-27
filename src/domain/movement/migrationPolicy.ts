import type { OperationalLedgerRecord, ReplayEligibility } from './types.js';

export interface MigrationPolicy {
  readonly operationalCutoff: string | undefined;
  classify(record: OperationalLedgerRecord): ReplayEligibility;
}
export const FEISHU_OPERATIONAL_SOURCE_BATCHES=['FEISHU_OPERATIONAL_LEDGER'] as const;

export class DefaultMigrationPolicy implements MigrationPolicy {
  constructor(readonly operationalCutoff: string | undefined = undefined,private readonly operationalSourceBatches:readonly string[] = []) {}
  classify(record: OperationalLedgerRecord): ReplayEligibility {
    if(/\[(?:历史追踪\|不计实时库存|LEGACY_MIGRATION)\]/i.test(record.remark??''))return 'HISTORICAL_EVIDENCE_ONLY';
    if(/\[(?:OPENING_BALANCE|CURRENT_STOCK_BASELINE|MIGRATION_BASELINE)\]/i.test(record.remark??''))return 'MIGRATION_BASELINE';
    const batch=(record.sourceBatch??'').toUpperCase();
    if(batch.includes('HISTORICAL_ONLY'))return 'HISTORICAL_EVIDENCE_ONLY';
    if(['OPENING_BALANCE','CURRENT_STOCK_BASELINE','MIGRATION_BASELINE'].some(marker=>batch.includes(marker)))return 'MIGRATION_BASELINE';
    // Provenance wins over a generic physical sheet/source label. A legacy or
    // manual import may live in the same Feishu ledger as native operations.
    if(record.origin==='LEGACY_MIGRATION'||record.origin==='MANUAL_IMPORT')return 'HISTORICAL_EVIDENCE_ONLY';
    if(record.origin==='SYSTEM_NATIVE')return 'CURRENT_STATE';
    if(this.operationalSourceBatches.some(value=>batch===value.toUpperCase()))return 'CURRENT_STATE';
    return 'CURRENT_STATE';
  }
}
