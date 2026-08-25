import { isOperationalShNumber } from '../shNumber.js';
export { isOperationalShNumber } from '../shNumber.js';

export interface ShCandidate {
  shNo: string; source: 'OPERATIONAL_LEDGER' | 'LEGACY_EVIDENCE'; confidence: 'EXACT' | 'CANDIDATE';
  operationallyValid: boolean; evidence: string[];
}
export interface ShResolver { resolveBySn(sn: string): Promise<ShCandidate[]> }
export interface OperationalLedgerShResolver extends ShResolver {}
export interface HistoricalLedgerShResolver extends ShResolver {}
export interface ShQueryService { resolveBySn(sn: string): Promise<ShCandidate[]> }

export class CombinedShQueryService implements ShQueryService {
  constructor(private readonly resolvers: readonly ShResolver[]) {}
  async resolveBySn(sn: string): Promise<ShCandidate[]> {
    const normalized = sn.trim().toUpperCase().replace(/\s+/g, '');
    if (!normalized) throw new TypeError('INVALID_SN');
    const candidates = (await Promise.all(this.resolvers.map((resolver) => resolver.resolveBySn(normalized)))).flat();
    return candidates.map((candidate) => ({ ...candidate, operationallyValid: candidate.source === 'OPERATIONAL_LEDGER' && isOperationalShNumber(candidate.shNo) }));
  }
}
