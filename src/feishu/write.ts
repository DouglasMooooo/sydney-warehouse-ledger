import { PROTECTED_COLUMNS, assertColumnWriteAllowed } from '../config/ledgerSchema.js';
import {
  assertLedgerStateFresh, createLedgerStateSnapshot, type LedgerStateSnapshot,
} from '../ledger/optimisticConcurrency.js';
import { runLarkCli } from './client.js';
import { cellsByAddress, readCells, readRange, readTypedRange } from './read.js';
import type { ExplicitWriteRequest, FeishuCell, LarkEnvelope, ProposedChange, TypedSheetData } from './types.js';

const addressPattern = /^([A-Z]+)([1-9]\d*)$/;

export interface WriteResult {
  dryRun: boolean;
  sheet: string;
  changes: ExplicitWriteRequest['changes'];
  verified: boolean;
}

export interface LedgerWriteVerificationIssue {
  code: string;
  cell?: string;
  message: string;
}

export interface LedgerWriteVerificationResult {
  ok: boolean;
  issues: LedgerWriteVerificationIssue[];
}

export interface VerifyLedgerWriteInput {
  changes: ProposedChange[];
  actualCells: Map<string, FeishuCell>;
  typedReads?: Map<string, TypedSheetData>;
  protectedBefore?: Map<string, FeishuCell>;
  protectedAfter?: Map<string, FeishuCell>;
  requiredFormulaAddresses?: string[];
}

export function captureWritePrecondition(
  spreadsheetUrl: string, sheetId: string, range: string,
): LedgerStateSnapshot {
  const data = readRange({
    spreadsheetUrl, sheetId, range,
    include: ['value', 'formula', 'style', 'data_validation'],
  });
  return createLedgerStateSnapshot(range, cellsByAddress(data), data.revision);
}

export function writeExplicitCells(request: ExplicitWriteRequest): WriteResult {
  if (request.changes.length === 0) throw new Error('No changes proposed');
  const seen = new Set<string>();
  for (const change of request.changes) {
    const match = addressPattern.exec(change.cell);
    if (!match) throw new Error(`Invalid cell address ${change.cell}`);
    assertColumnWriteAllowed(match[1]!, request.purpose);
    if (seen.has(change.cell)) throw new Error(`Duplicate target ${change.cell}`);
    seen.add(change.cell);
    if ((change.newFormula === undefined) === (change.newValue === undefined)) {
      throw new Error(`Exactly one of newFormula/newValue is required for ${change.cell}`);
    }
    validateChangeType(change);
  }
  if (request.dryRun) {
    return { dryRun: true, sheet: request.sheetName, changes: request.changes, verified: false };
  }

  if (request.purpose === 'BUSINESS_RECORD') {
    if (!request.precondition) throw new Error('Business write requires an optimistic concurrency precondition');
    const currentState = captureWritePrecondition(
      request.spreadsheetUrl, request.sheetId, request.precondition.range,
    );
    assertLedgerStateFresh(request.precondition, currentState);
  }

  const businessRows = request.purpose === 'BUSINESS_RECORD'
    ? [...new Set(request.changes.map((change) => Number(addressPattern.exec(change.cell)![2])))]
    : [];
  const protectedBefore = businessRows.length > 0
    ? readProtectedRows(request.spreadsheetUrl, request.sheetId, businessRows)
    : new Map<string, FeishuCell>();

  const operations = request.changes.map((change) => ({
    shortcut: '+cells-set',
    input: {
      sheet_id: request.sheetId,
      range: change.cell,
      cells: [[writeCellPayload(change)]],
    },
  }));
  const response = runLarkCli<LarkEnvelope<unknown>>([
    'sheets', '+batch-update', '--url', request.spreadsheetUrl, '--yes', '--operations', '-',
  ], JSON.stringify(operations));
  if (!response.ok) throw new Error('Feishu batch write failed');

  const reread = readCells({
    spreadsheetUrl: request.spreadsheetUrl,
    sheetId: request.sheetId,
    range: boundingRange(request.changes.map((change) => change.cell)),
    include: ['value', 'formula', 'style', 'data_validation'],
  });
  const typedReads = new Map<string, TypedSheetData>();
  for (const change of request.changes) if (change.newValue !== undefined && change.valueType) {
    typedReads.set(change.cell, readTypedRange({
      spreadsheetUrl: request.spreadsheetUrl, sheetId: request.sheetId, range: change.cell,
    }));
  }
  let protectedAfter = new Map<string, FeishuCell>();
  if (businessRows.length > 0) {
    protectedAfter = readProtectedRows(request.spreadsheetUrl, request.sheetId, businessRows);
  }
  const verification = verifyLedgerWrite({
    changes: request.changes,
    actualCells: reread,
    typedReads,
    protectedBefore,
    protectedAfter,
    requiredFormulaAddresses: request.requiredFormulaAddresses ?? [],
  });
  if (!verification.ok) {
    throw new Error(`Post-write verification failed: ${verification.issues.map((issue) => `${issue.code}${issue.cell ? `:${issue.cell}` : ''}`).join(', ')}`);
  }
  return { dryRun: false, sheet: request.sheetName, changes: request.changes, verified: true };
}

export function writeCellPayload(change: ProposedChange): Record<string, unknown> {
  if (change.newFormula !== undefined) return { formula: change.newFormula };
  const payload: Record<string, unknown> = { value: change.newValue };
  if (change.numberFormat !== undefined) payload.cell_styles = { number_format: change.numberFormat };
  return payload;
}

export function validateChangeType(change: ProposedChange): void {
  if (change.valueType !== 'date') return;
  if (typeof change.newValue !== 'number' || !Number.isFinite(change.newValue)) {
    throw new Error(`Date change ${change.cell} must use a numeric Feishu serial`);
  }
  if (change.numberFormat !== 'yyyy-mm-dd') {
    throw new Error(`Date change ${change.cell} must use number format yyyy-mm-dd`);
  }
  if (change.newFormula !== undefined) throw new Error(`Date change ${change.cell} cannot be a formula`);
}

export function verifyDateReadback(change: ProposedChange, typed: TypedSheetData): void {
  validateChangeType(change);
  const column = typed.columns[0];
  if (!column) throw new Error(`Typed reread returned no column for ${change.cell}`);
  const dtype = typed.dtypes[column]?.toLowerCase() ?? '';
  if (!dtype.includes('date')) throw new Error(`Typed reread for ${change.cell} is ${dtype || 'unknown'}, not date`);
  const format = typed.formats?.[column];
  if (format !== 'yyyy-mm-dd') throw new Error(`Typed reread format for ${change.cell} is ${format ?? 'missing'}`);
  const rereadValue = typed.data[0]?.[0];
  if (rereadValue === null || rereadValue === undefined || rereadValue === '') {
    throw new Error(`Typed reread returned no date for ${change.cell}`);
  }
  const expectedDate = dateSerialToIso(change.newValue as number);
  const actualDate = String(rereadValue).slice(0, 10);
  if (actualDate !== expectedDate) {
    throw new Error(`Typed reread for ${change.cell} returned ${actualDate}, expected ${expectedDate}`);
  }
}

export function verifyLedgerWrite(input: VerifyLedgerWriteInput): LedgerWriteVerificationResult {
  const issues: LedgerWriteVerificationIssue[] = [];
  for (const change of input.changes) {
    const actual = input.actualCells.get(change.cell);
    if (!actual) {
      issues.push({ code: 'MISSING_REREAD_CELL', cell: change.cell, message: 'Cell was not returned by reread' });
      continue;
    }
    if (change.newFormula !== undefined) {
      if (actual.formula !== change.newFormula) {
        issues.push({ code: 'FORMULA_MISMATCH', cell: change.cell, message: 'Formula differs after reread' });
      }
      continue;
    }
    if (change.valueType === 'date') {
      // cells-get exposes a formatted display scalar on current CLI versions;
      // table-get dtype is the authoritative storage-type check.
      if (typeof actual.value === 'number' && actual.value !== change.newValue) {
        issues.push({ code: 'DATE_SERIAL_MISMATCH', cell: change.cell, message: 'Raw date serial differs after reread' });
      }
      const typed = input.typedReads?.get(change.cell);
      if (!typed) {
        issues.push({ code: 'DATE_TYPED_REREAD_MISSING', cell: change.cell, message: 'Typed date reread is missing' });
      } else {
        try {
          verifyDateReadback(change, typed);
        } catch (error) {
          issues.push({ code: 'DATE_TYPED_REREAD_INVALID', cell: change.cell, message: String(error) });
        }
      }
      continue;
    }
    if (change.valueType === 'number') {
      verifyTypedScalar(change, input.typedReads?.get(change.cell), 'number', issues);
      continue;
    }
    if (change.valueType === 'text') {
      verifyTypedScalar(change, input.typedReads?.get(change.cell), 'text', issues);
      continue;
    }
    if (!Object.is(actual.value, change.newValue)) {
      issues.push({ code: 'VALUE_MISMATCH', cell: change.cell, message: 'Value differs after reread' });
    }
  }

  if (input.protectedBefore && input.protectedAfter && !sameProtectedCells(input.protectedBefore, input.protectedAfter)) {
    issues.push({ code: 'PROTECTED_COLUMN_CHANGED', message: 'Protected formula/helper state changed' });
  }
  for (const address of input.requiredFormulaAddresses ?? []) {
    if (!input.protectedAfter?.get(address)?.formula) {
      issues.push({ code: 'REQUIRED_FORMULA_MISSING', cell: address, message: 'Required formula is missing after write' });
    }
  }
  for (const [address, cell] of input.protectedAfter ?? []) {
    if (cell.formula && isFormulaError(cell.value)) {
      issues.push({ code: 'FORMULA_RESULT_ERROR', cell: address, message: `Formula recalculated to ${String(cell.value)}` });
    }
  }
  return { ok: issues.length === 0, issues };
}

function verifyTypedScalar(
  change: ProposedChange,
  typed: TypedSheetData | undefined,
  expectedType: 'number' | 'text',
  issues: LedgerWriteVerificationIssue[],
): void {
  if (!typed) {
    issues.push({ code: 'TYPED_REREAD_MISSING', cell: change.cell, message: 'Typed reread is missing' });
    return;
  }
  const column = typed.columns[0];
  const dtype = column ? typed.dtypes[column]?.toLowerCase() ?? '' : '';
  const value = typed.data[0]?.[0];
  const typeMatches = expectedType === 'number'
    ? /^(float|int|uint|number)/.test(dtype) && typeof value === 'number' && Number.isFinite(value)
    : (dtype === 'object' || dtype.includes('string')) && typeof value === 'string';
  if (!typeMatches) {
    issues.push({
      code: expectedType === 'number' ? 'NUMBER_STORED_AS_NON_NUMERIC' : 'TEXT_STORED_AS_NON_TEXT',
      cell: change.cell,
      message: `Typed reread dtype/value is ${dtype || 'unknown'}/${typeof value}`,
    });
    return;
  }
  if (!Object.is(value, change.newValue)) {
    issues.push({ code: 'VALUE_MISMATCH', cell: change.cell, message: 'Typed reread value differs' });
  }
}

function readProtectedRows(spreadsheetUrl: string, sheetId: string, rows: number[]): Map<string, FeishuCell> {
  const result = new Map<string, FeishuCell>();
  for (const row of rows) {
    const cells = readCells({
      spreadsheetUrl, sheetId, range: `H${row}:AC${row}`,
      include: ['value', 'formula', 'style', 'data_validation'],
    });
    for (const column of PROTECTED_COLUMNS) result.set(`${column}${row}`, cells.get(`${column}${row}`) ?? {});
  }
  return result;
}

function dateSerialToIso(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10);
}

function isFormulaError(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return value.startsWith('#') || value.includes('~CIRCULAR~REF~');
}

export function sameProtectedCells(before: Map<string, FeishuCell>, after: Map<string, FeishuCell>): boolean {
  if (before.size !== after.size) return false;
  for (const [address, cell] of before) {
    if (JSON.stringify(protectedFingerprint(cell)) !== JSON.stringify(protectedFingerprint(after.get(address) ?? {}))) return false;
  }
  return true;
}

function protectedFingerprint(cell: FeishuCell): Record<string, unknown> {
  const fingerprint: Record<string, unknown> = {
    formula: cell.formula,
    cell_styles: cell.cell_styles,
    style: cell.style,
    data_validation: cell.data_validation,
  };
  // Formula results may legitimately recalculate when business inputs change.
  // Protected fixed-value cells must remain byte-for-byte stable.
  if (!cell.formula) fingerprint.value = cell.value;
  return fingerprint;
}

function columnNumber(column: string): number {
  return [...column].reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);
}

function numberColumn(value: number): string {
  let current = value;
  let result = '';
  while (current > 0) {
    current -= 1;
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26);
  }
  return result;
}

function boundingRange(addresses: string[]): string {
  const parsed = addresses.map((address) => {
    const match = addressPattern.exec(address)!;
    return { column: columnNumber(match[1]!), row: Number(match[2]) };
  });
  const minColumn = Math.min(...parsed.map((item) => item.column));
  const maxColumn = Math.max(...parsed.map((item) => item.column));
  const minRow = Math.min(...parsed.map((item) => item.row));
  const maxRow = Math.max(...parsed.map((item) => item.row));
  return `${numberColumn(minColumn)}${minRow}:${numberColumn(maxColumn)}${maxRow}`;
}
