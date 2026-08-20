import { randomUUID } from 'node:crypto';
import type { WarehouseRole } from '../auth/types.js';

export interface OperationalLogEvent {
  requestId: string;
  route: string;
  outcome: 'success' | 'failure';
  durationMs: number;
  errorCode?: string;
  role?: WarehouseRole;
}

export function requestId(request: Request): string {
  const supplied = request.headers.get('x-request-id');
  return supplied && /^[A-Za-z0-9._-]{1,80}$/.test(supplied) ? supplied : randomUUID();
}

export function logOperationalEvent(event: OperationalLogEvent, sink: (line: string) => void = console.info): void {
  sink(JSON.stringify(event));
}

export function operationalRequestLogger(request: Request, route: string, sink: (line: string) => void = console.info) {
  const startedAt = Date.now(), id = requestId(request);
  let role: WarehouseRole | undefined;
  const emit = (outcome: 'success' | 'failure', errorCode?: string) => logOperationalEvent({
    requestId: id, route, outcome, durationMs: Math.max(0, Date.now() - startedAt), ...(role ? { role } : {}), ...(errorCode ? { errorCode } : {}),
  }, sink);
  return { setRole(value: WarehouseRole | undefined) { role = value; }, success() { emit('success'); }, failure(code: string) { emit('failure', code); } };
}
