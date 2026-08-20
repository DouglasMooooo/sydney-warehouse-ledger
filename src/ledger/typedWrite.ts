import { LEDGER_COLUMNS, assertColumnWriteAllowed, type BusinessColumn } from '../config/ledgerSchema.js';
import {
  normalizeAction, normalizeContainer, normalizeLocation, normalizePickupCode,
  normalizeQty, normalizeSH, normalizeSKU, normalizeSN, normalizeStockCondition,
  normalizeIdentifier, normalizeRemark, normalizeField, LedgerNormalizationError,
} from './normalize.js';
import { parseBusinessDateString, toFeishuDateSerial } from './businessDate.js';
import { validateLedgerInput, type NormalizedLedgerInput, type ValidationError } from './validators.js';

export interface LedgerWriteInput {
  date?: unknown;
  outboundDate?: unknown;
  action?: unknown;
  shNo?: unknown;
  pickupCode?: unknown;
  containerCode?: unknown;
  sku?: unknown;
  sn?: unknown;
  qty?: unknown;
  fromLocation?: unknown;
  toLocation?: unknown;
  erpWarehouse?: unknown;
  stockCondition?: unknown;
  /** Trusted current-state context for Move validation; this is not a ledger column. */
  sourceStockCondition?: unknown;
  remark?: unknown;
}

export interface ProposedLedgerCell {
  column: BusinessColumn;
  value: string | number;
  valueType: 'text' | 'number' | 'date';
  numberFormat?: string;
}

export interface PreparedLedgerWrite {
  ok: boolean;
  dryRun: boolean;
  normalized?: NormalizedLedgerInput;
  proposedCells: ProposedLedgerCell[];
  errors: ValidationError[];
}

export function prepareLedgerWrite(input: LedgerWriteInput, dryRun = true): PreparedLedgerWrite {
  let normalized: NormalizedLedgerInput;
  try {
    normalized = compact({
      date: normalizeField('date', () => parseBusinessDateString(input.date)),
      outboundDate: normalizeField('outboundDate', () => parseBusinessDateString(input.outboundDate)),
      action: normalizeField('action', () => normalizeAction(input.action)),
      shNo: normalizeField('shNo', () => normalizeSH(input.shNo)),
      pickupCode: normalizeField('pickupCode', () => normalizePickupCode(input.pickupCode)),
      containerCode: normalizeField('containerCode', () => normalizeContainer(input.containerCode)),
      sku: normalizeField('sku', () => normalizeSKU(input.sku)),
      sn: normalizeField('sn', () => normalizeSN(input.sn)),
      qty: normalizeField('qty', () => normalizeQty(input.qty)),
      fromLocation: normalizeField('fromLocation', () => normalizeLocation(input.fromLocation)),
      toLocation: normalizeField('toLocation', () => normalizeLocation(input.toLocation)),
      erpWarehouse: normalizeField('erpWarehouse', () => normalizeIdentifier(input.erpWarehouse, 'erpWarehouse')),
      stockCondition: normalizeField('stockCondition', () => normalizeStockCondition(input.stockCondition)),
      sourceStockCondition: normalizeField('sourceStockCondition', () => normalizeStockCondition(input.sourceStockCondition)),
      remark: normalizeField('remark', () => normalizeRemark(input.remark)),
    }) as NormalizedLedgerInput;
  } catch (error) {
    const normalizationError = error instanceof LedgerNormalizationError
      ? error
      : new LedgerNormalizationError('unknown', error instanceof Error ? error.message : String(error));
    return {
      ok: false, dryRun, proposedCells: [],
      errors: [{ code: normalizationError.code, field: normalizationError.field, message: normalizationError.message }],
    };
  }
  const validation = validateLedgerInput(normalized);
  if (!validation.ok) return { ok: false, dryRun, normalized, proposedCells: [], errors: validation.errors };

  const proposedCells: ProposedLedgerCell[] = [];
  const add = (column: BusinessColumn, value: string | number | undefined, valueType: ProposedLedgerCell['valueType'], numberFormat?: string) => {
    if (value === undefined) return;
    assertColumnWriteAllowed(column, 'BUSINESS_RECORD');
    const cell: ProposedLedgerCell = { column, value, valueType };
    if (numberFormat !== undefined) cell.numberFormat = numberFormat;
    proposedCells.push(cell);
  };
  add(LEDGER_COLUMNS.date, normalized.date && toFeishuDateSerial(normalized.date), 'date', 'yyyy-mm-dd');
  add(LEDGER_COLUMNS.outboundDate, normalized.outboundDate && toFeishuDateSerial(normalized.outboundDate), 'date', 'yyyy-mm-dd');
  add(LEDGER_COLUMNS.action, normalized.action, 'text');
  add(LEDGER_COLUMNS.shNo, normalized.shNo, 'text');
  add(LEDGER_COLUMNS.pickupCode, normalized.pickupCode, 'text');
  add(LEDGER_COLUMNS.containerCode, normalized.containerCode, 'text');
  add(LEDGER_COLUMNS.sku, normalized.sku, 'text');
  add(LEDGER_COLUMNS.sn, normalized.sn, 'text');
  add(LEDGER_COLUMNS.qty, normalized.qty, 'number', '0');
  add(LEDGER_COLUMNS.fromLocation, normalized.fromLocation, 'text');
  add(LEDGER_COLUMNS.toLocation, normalized.toLocation, 'text');
  add(LEDGER_COLUMNS.erpWarehouse, normalized.erpWarehouse, 'text');
  add(LEDGER_COLUMNS.stockCondition, normalized.stockCondition, 'text');
  add(LEDGER_COLUMNS.remark, normalized.remark, 'text');
  return { ok: true, dryRun, normalized, proposedCells, errors: [] };
}

function compact<T extends object>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

export function verifyPreparedWrite(expected: ProposedLedgerCell[], actual: Map<string, unknown>, row: number): boolean {
  return expected.every((cell) => Object.is(actual.get(`${cell.column}${row}`), cell.value));
}
