import type { SnContext } from '../../ai/types.js';
export interface SnContextService { get(sn: string): Promise<SnContext> }
export class PendingSnContextService implements SnContextService {
  async get(sn: string): Promise<SnContext> {
    const normalized = sn.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) throw new TypeError('INVALID_SN');
    return { sn: normalized, currentState: { status: 'UNAVAILABLE', reason: 'Reliable current state requires a current-inventory SN projection.' },
      lifecycleStatus: 'DEPENDENCY_PENDING', lifecycle: [], exceptions: [], historicalEvidence: [] };
  }
}
