export type SnStatus = 'ORIGINAL' | 'REPAIRED_GOOD' | 'UNKNOWN';

export type SnMaterialRule = {
  id: string;
  family: string;
  pattern: string;
  materialCode: string;
  model: string;
  confidence: 'EXACT' | 'HIGH' | 'FAMILY' | 'REVIEW_REQUIRED';
  evidenceCount?: number;
  source?: string;
  active: boolean;
  notes?: string;
  revisions?: readonly string[];
};

export type VerifiedSnMapping = {
  sn: string;
  canonicalSn: string;
  materialCode: string;
  model?: string;
  verified: boolean;
  source: 'WMS_IMPORT' | 'ERP_IMPORT' | 'MANUAL_CONFIRMED' | 'LEDGER';
  createdAt: string;
};

export type SnResolveResult = {
  inputSn: string;
  normalizedSn: string;
  canonicalSn: string;
  snStatus: SnStatus;
  family?: string;
  materialCode?: string;
  model?: string;
  confidence: 'EXACT_HISTORY' | 'EXACT_RULE' | 'HIGH' | 'REVIEW_REQUIRED';
  matchMethod: 'EXACT_HISTORY' | 'PREFIX_REVISION_RULE' | 'FAMILY_RULE' | 'NONE';
  matchedRuleId?: string;
  reason: string;
  requiresManualReview: boolean;
};

