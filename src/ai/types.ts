export type RecordOrigin =
  | 'SYSTEM_NATIVE'
  | 'LEGACY_MIGRATION'
  | 'MANUAL_IMPORT'
  | 'ERP'
  | 'WMS'
  | 'PHYSICAL_COUNT';

export interface HistoricalEvidence {
  source: 'LEGACY_MIGRATION';
  businessDate?: string;
  action?: string;
  reference?: string;
  summary: string;
}

export interface AiExceptionSummary {
  code: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  summary: string;
}

export interface SnLifecycleEvent {
  movementId: string;
  occurredAt: string;
  action: string;
  origin: RecordOrigin;
}

export interface SnContext {
  sn: string;
  currentState:
    | { status: 'AVAILABLE'; sku: string; displayName?: string; location: string; stockCondition: string; lastMovementId?: string }
    | { status: 'NOT_IN_CURRENT_INVENTORY' }
    | { status: 'UNAVAILABLE'; reason: string };
  lifecycleStatus: 'AVAILABLE' | 'DEPENDENCY_PENDING';
  lifecycle: SnLifecycleEvent[];
  exceptions: AiExceptionSummary[];
  historicalEvidence: HistoricalEvidence[];
}
