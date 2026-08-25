import type { AiCapability } from './capabilities.js';

export type AiQueryType = 'INVENTORY' | 'SN' | 'MOVEMENT' | 'EXCEPTION' | 'SH' | 'WORKFLOW' | 'LEGACY_NL_QUERY';
export type AiResponseStatus = 'SUCCESS' | 'NOT_FOUND' | 'DENIED' | 'ERROR' | 'DEPENDENCY_PENDING';
export interface AiQueryAuditEvent {
  requestId: string; requestedAt: string; principalId: string; userId?: string;
  capability: AiCapability; queryType: AiQueryType; entityType?: string; entityId?: string;
  dataSources: string[]; responseStatus: AiResponseStatus; durationMs: number;
}
export function emitAiQueryAudit(event: AiQueryAuditEvent, sink: (line: string) => void = console.info): void { sink(JSON.stringify(event)); }
