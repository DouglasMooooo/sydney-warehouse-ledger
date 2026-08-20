import type { LocationSummaryIssue } from './locationSummary.js';
import type { QualityIssue } from '../quality/types.js';
import type { OperationalLedgerRow } from './todayTasks.js';
import { ACTIONS, STOCK_CONDITIONS } from '../config/controlledValues.js';

export const LIVE_OPERATIONAL_EXCEPTION_CODES = [
  'INVALID_ACTION', 'INVALID_STOCK_CONDITION',
  'INVALID_LOCATION', 'INVALID_QTY', 'MISSING_SKU', 'MISSING_SN',
  'PREPARED_WITHOUT_SOURCE_LOCATION', 'PREPARED_WITHOUT_PICKUP_CODE',
  'PRODUCT_OUTBOUND_WITHOUT_SN', 'RETURN_WITHOUT_TARGET_LOCATION',
  'MOVE_WITHOUT_SOURCE', 'MOVE_WITHOUT_TARGET', 'CONTAINER_MISMATCH',
  'MISSING_INVENTORY_QTY', 'INVALID_INVENTORY_QTY',
] as const;

export const DEEP_QUALITY_EXCEPTION_CODES = [
  'DATE_STORED_AS_TEXT', 'HIDDEN_CHARACTER', 'FORMULA_MISSING', 'FORMULA_BROKEN', 'VALIDATION_NOT_OK',
] as const;

export interface OperationalException {
  severity: 'ERROR' | 'WARNING';
  code: string;
  ledgerRow?: number;
  sh?: string;
  pickupCode?: string;
  sku?: string;
  sn?: string;
  currentValue?: string;
  description: string;
  suggestedAction: string;
}

export function qualityIssueToOperationalException(issue: QualityIssue): OperationalException {
  return {
    severity: issue.severity,
    code: issue.code,
    ledgerRow: issue.row,
    currentValue: issue.evidence,
    description: issue.evidence,
    suggestedAction: issue.suggestedAction,
  };
}

export function inventoryIssuesToOperationalExceptions(
  issues: LocationSummaryIssue[],
): OperationalException[] {
  return issues.map((issue) => {
    const exception: OperationalException = {
      severity: 'ERROR',
      code: issue.code,
      description: issue.code === 'MISSING_INVENTORY_QTY'
        ? 'Current-inventory quantity is missing.'
        : 'Current-inventory quantity is malformed.',
      suggestedAction: 'Review the source ledger row; do not invent or coerce quantity.',
    };
    if (issue.sourceRow !== undefined) exception.ledgerRow = issue.sourceRow;
    if (issue.location) exception.currentValue = issue.location;
    return exception;
  });
}

export function detectContainerMismatches(
  records: Array<{ container?: string; location: string; sourceRow?: number }>,
): OperationalException[] {
  const locations = new Map<string, Set<string>>();
  for (const record of records) {
    const container = record.container?.trim();
    const location = record.location.trim();
    if (!container || !location) continue;
    const set = locations.get(container) ?? new Set<string>();
    set.add(location);
    locations.set(container, set);
  }
  return [...locations.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([container, set]) => ({
      severity: 'ERROR' as const,
      code: 'CONTAINER_MISMATCH',
      currentValue: container,
      description: `Container appears in multiple locations: ${[...set].sort().join(', ')}`,
      suggestedAction: 'Review source records and physically verify the container location.',
    }));
}

export function deriveLedgerExceptions(
  rows: OperationalLedgerRow[],
  validLocations: ReadonlySet<string> = new Set(),
): OperationalException[] {
  const result: OperationalException[] = [];
  const add = (row: OperationalLedgerRow, code: string, description: string, currentValue?: string) => {
    const exception: OperationalException = {
    severity: 'ERROR', code, ledgerRow: row.ledgerRow,
      description, suggestedAction: 'Review the source row; do not bulk-fix historical data.',
    };
    if (row.sh) exception.sh = row.sh;
    if (row.pickupCode) exception.pickupCode = row.pickupCode;
    if (row.sku) exception.sku = row.sku;
    if (row.sn) exception.sn = row.sn;
    if (currentValue) exception.currentValue = currentValue;
    result.push(exception);
  };
  for (const row of rows) {
    if (!ACTIONS.includes(row.action as (typeof ACTIONS)[number])) add(row, 'INVALID_ACTION', 'Action is outside the controlled list.', row.action);
    if (row.qty === undefined || !Number.isFinite(row.qty) || row.qty <= 0) add(row, 'INVALID_QTY', 'Qty is not a valid positive number.');
    const condition = (row as OperationalLedgerRow & { stockCondition?: string }).stockCondition ?? '';
    if (!STOCK_CONDITIONS.includes(condition as (typeof STOCK_CONDITIONS)[number])) add(row, 'INVALID_STOCK_CONDITION', 'Stock condition is outside the controlled list.', condition);
    for (const location of [row.fromLocation, row.toLocation]) {
      if (location && validLocations.size > 0 && !validLocations.has(location)) add(row, 'INVALID_LOCATION', 'Location is absent from the location master.', location);
    }
    if (row.action !== '退回维修' && !row.sku) add(row, 'MISSING_SKU', 'SKU is required for this action.');
    if (row.action === '退回维修' && !row.sn) add(row, 'MISSING_SN', 'Return to Repair requires SN.');
    if (row.action === '备货' && !row.fromLocation) add(row, 'PREPARED_WITHOUT_SOURCE_LOCATION', 'Prepared row has no source location.');
    if (row.action === '备货' && !row.pickupCode) add(row, 'PREPARED_WITHOUT_PICKUP_CODE', 'Prepared row has no Pickup Code.');
    if (row.action === '出库' && condition !== '物料' && !row.sn) add(row, 'PRODUCT_OUTBOUND_WITHOUT_SN', 'Product outbound row has no SN.');
    if (row.action === '退回维修' && !row.toLocation) add(row, 'RETURN_WITHOUT_TARGET_LOCATION', 'Return row has no target location.');
    if (row.action === '移库' && !row.fromLocation) add(row, 'MOVE_WITHOUT_SOURCE', 'Move row has no source location.');
    if (row.action === '移库' && !row.toLocation) add(row, 'MOVE_WITHOUT_TARGET', 'Move row has no target location.');
  }
  return result;
}
