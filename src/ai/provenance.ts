export interface AiProvenance {
  generatedAt: string;
  dataCutoff: string;
  primarySource: 'OPERATIONAL_LEDGER' | 'WORKFLOW_DEFINITION' | 'LEGACY_EVIDENCE' | 'MIXED';
  legacyEvidenceIncluded: boolean;
  verification: {
    operationalLedger: 'VERIFIED' | 'PARTIAL' | 'NOT_USED';
    erp: 'VERIFIED' | 'NOT_CONNECTED' | 'NOT_USED';
    wms: 'VERIFIED' | 'NOT_CONNECTED' | 'NOT_USED';
    physicalCount: 'VERIFIED' | 'NOT_CONNECTED' | 'NOT_USED';
  };
}

export interface AiQueryResponse<T> { data: T; provenance: AiProvenance; requestId: string }

export function operationalLedgerProvenance(dataCutoff: string, now = new Date()): AiProvenance {
  return { generatedAt: now.toISOString(), dataCutoff, primarySource: 'OPERATIONAL_LEDGER', legacyEvidenceIncluded: false,
    verification: { operationalLedger: 'VERIFIED', erp: 'NOT_CONNECTED', wms: 'NOT_CONNECTED', physicalCount: 'NOT_CONNECTED' } };
}

export function workflowDefinitionProvenance(dataCutoff: string, now = new Date()): AiProvenance {
  return { generatedAt: now.toISOString(), dataCutoff, primarySource: 'WORKFLOW_DEFINITION', legacyEvidenceIncluded: false,
    verification: { operationalLedger: 'NOT_USED', erp: 'NOT_CONNECTED', wms: 'NOT_CONNECTED', physicalCount: 'NOT_USED' } };
}
