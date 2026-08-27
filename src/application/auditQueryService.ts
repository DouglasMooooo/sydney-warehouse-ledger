import { isOperationalShNumber } from './shNumber.js';
import { normalizeSn } from '../snResolver/resolver.js';
import { LiveMovementQueryService, ProjectedMovementRepository, type MovementDetail, type MovementQuery, type MovementReadPort } from './queries/movementQueryService.js';
import { ReplaySnContextService } from './queries/snContextService.js';
import type { CurrentSnState } from '../domain/sn/types.js';
import type { MovementValidationIssue } from '../domain/movement/types.js';
import { getWmsSyncMonitor, type WmsSyncMonitor } from './wmsSyncMonitor.js';

export interface AuditQueryInput {
  shNo?: string;
  sn?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface LedgerAuditResult {
  source: 'LIVE_FEISHU_LEDGER';
  query: { type: 'SH' | 'SN' | 'RECENT'; value?: string; fromDate?: string; toDate?: string };
  records: MovementDetail[];
  issues: MovementValidationIssue[];
  currentSnState?: CurrentSnState;
  wmsMonitor: WmsSyncMonitor;
  truncated: boolean;
}

export class LiveLedgerAuditService {
  constructor(private readonly port: MovementReadPort) {}

  async search(input: AuditQueryInput): Promise<LedgerAuditResult> {
    const query = normalizeAuditQuery(input);
    const repository = new ProjectedMovementRepository(this.port);
    const movements = await new LiveMovementQueryService(repository).search(query.movementQuery);
    const ordered = [...movements.items].sort((left, right) =>
      (right.businessDate.localeCompare(left.businessDate)) || right.movementId.localeCompare(left.movementId));
    const records = ordered.slice(0, query.limit);
    const result: LedgerAuditResult = {
      source: 'LIVE_FEISHU_LEDGER', query: query.display, records,
      issues: movements.issues, wmsMonitor: getWmsSyncMonitor(), truncated: ordered.length > records.length,
    };
    if (query.display.type === 'SN' && query.display.value) {
      result.currentSnState = await new ReplaySnContextService(repository).get(query.display.value).then((item) => item.currentState);
    }
    return result;
  }
}

function normalizeAuditQuery(input: AuditQueryInput): { movementQuery: MovementQuery; display: LedgerAuditResult['query']; limit: number } {
  const shNo = input.shNo?.trim().toUpperCase();
  const sn = input.sn?.trim() ? normalizeSn(input.sn) : undefined;
  if (shNo && sn) throw new TypeError('AUDIT_QUERY_REQUIRES_ONE_IDENTIFIER');
  if (shNo && !isOperationalShNumber(shNo)) throw new TypeError('INVALID_SH_REFERENCE');
  if (input.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate)) throw new TypeError('INVALID_FROM_DATE');
  if (input.toDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)) throw new TypeError('INVALID_TO_DATE');
  if (input.fromDate && input.toDate && input.fromDate > input.toDate) throw new TypeError('INVALID_AUDIT_DATE_RANGE');
  const limit = Number.isInteger(input.limit) ? Number(input.limit) : 200;
  if (limit < 1 || limit > 10_000) throw new TypeError('INVALID_AUDIT_LIMIT');
  const movementQuery: MovementQuery = {
    ...(shNo ? { shNo } : {}), ...(sn ? { sn } : {}),
    ...(input.fromDate ? { fromDate: input.fromDate } : {}), ...(input.toDate ? { toDate: input.toDate } : {}),
  };
  const identifier = shNo || sn;
  const display: LedgerAuditResult['query'] = {
    type: shNo ? 'SH' : sn ? 'SN' : 'RECENT', ...(identifier ? { value: identifier } : {}),
    ...(input.fromDate ? { fromDate: input.fromDate } : {}), ...(input.toDate ? { toDate: input.toDate } : {}),
  };
  return { movementQuery, display, limit };
}
