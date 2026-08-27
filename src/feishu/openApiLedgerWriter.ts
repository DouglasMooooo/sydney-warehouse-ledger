import { createHash } from 'node:crypto';
import { assertMainLedgerSchema, BUSINESS_COLUMNS, PROTECTED_COLUMNS } from '../config/ledgerSchema.js';
import type { LedgerWriteInput, ProposedLedgerCell } from '../ledger/typedWrite.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import { requiredEnv } from './client.js';
import { openApiClientFromEnv, type FeishuOpenApiClient } from './openApiClient.js';
import { FeishuOpenApiWarehouseSheetReader } from './sheetReader.js';
import type { WarehouseSheetReader } from './sheetReader.js';

export type LedgerWriteStatus = 'VERIFIED' | 'ALREADY_COMMITTED' | 'WRITE_UNVERIFIED';
export interface ConfirmedOpenApiWrite { rows: number[]; verified: true; reconciliation: 'PASS'; status?: LedgerWriteStatus; movementIds?: string[] }
export interface WarehouseLedgerWriteContext { createdBy: string; commandId?: string }
export interface WarehouseLedgerWritePort { append(inputs: readonly LedgerWriteInput[], context?: WarehouseLedgerWriteContext): Promise<ConfirmedOpenApiWrite> }

const COLUMN_INDEX = Object.fromEntries(Array.from({ length: 29 }, (_, index) => [columnName(index + 1), index])) as Record<string, number>;
const MAX_APPEND_ATTEMPTS = 3;

export class OpenApiLedgerWriter {
  constructor(
    private readonly spreadsheetToken: string,
    private readonly sheetId: string,
    private readonly client: FeishuOpenApiClient,
    private readonly reader: WarehouseSheetReader,
  ) {}

  async append(inputs: readonly LedgerWriteInput[], context?: WarehouseLedgerWriteContext): Promise<ConfirmedOpenApiWrite> {
    if (!inputs.length || inputs.length > 100) throw new TypeError('一次写入必须包含 1–100 行。');
    const initiallyPrepared = inputs.map((input) => prepareLedgerWrite(input, false));
    const initialInvalid = initiallyPrepared.find((item) => !item.ok);
    if (initialInvalid) throw new TypeError(`LEDGER_VALIDATION_FAILED:${initialInvalid.errors.map((item) => item.code).join(',')}`);
    const commandId = resolveCommandId(context?.commandId);
    const identities = initiallyPrepared.map((item, index) => createMovementIdentity(item.normalized!, commandId, index));
    if (new Set(identities.map((item) => item.idempotencyKey)).size !== identities.length) throw new TypeError('DUPLICATE_MOVEMENT_COMMAND');
    const decoratedInputs = context ? inputs.map((input, index) => ({ ...input, remark: appendSystemMarker(String(input.remark ?? ''), identities[index]!, context.createdBy) })) : inputs;
    const prepared = decoratedInputs.map((input) => prepareLedgerWrite(input, false));
    const invalid = prepared.find((item) => !item.ok);
    if (invalid) throw new TypeError(`LEDGER_VALIDATION_FAILED:${invalid.errors.map((item) => item.code).join(',')}`);
    const schema = await this.reader.readTable({ sheetId: this.sheetId, range: 'A1:AC1' });
    assertMainLedgerSchema(schema.columns);
    for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
      const table = await this.reader.readTable({ sheetId: this.sheetId, noHeader: true });
      const committed = resolveCommittedRows(table.data, identities);
      if (committed.kind === 'all') return { rows: committed.rows, verified: true, reconciliation: 'PASS', status: 'ALREADY_COMMITTED', movementIds: identities.map((item) => item.movementId) };
      if (committed.kind === 'partial' || committed.kind === 'mismatch') throw new Error(committed.kind === 'partial' ? 'PARTIAL_IDEMPOTENCY_CONFLICT' : 'IDEMPOTENCY_PAYLOAD_MISMATCH');
      const firstRow = nextAppendBusinessRow(table.data);
      const rows = inputs.map((_, index) => firstRow + index);
      const targetRange = `A${firstRow}:AC${rows[rows.length - 1]!}`;
      const beforeRaw = await this.readRange(targetRange, 'UnformattedValue');
      if (!rowsBlank(beforeRaw, inputs.length)) continue;
      const beforeFormula = await this.readRange(targetRange, 'Formula');
      const valueRanges: Array<{ range: string; values: unknown[][] }> = [];
      const dated: Array<{ range: string; serial: number }> = [];
      prepared.forEach((item, rowOffset) => item.proposedCells.forEach((cell) => {
        const row = firstRow + rowOffset;
        valueRanges.push({ range: `${this.sheetId}!${cell.column}${row}:${cell.column}${row}`, values: [[cell.value]] });
        if (cell.valueType === 'date') dated.push({ range: `${this.sheetId}!${cell.column}${row}:${cell.column}${row}`, serial: cell.value as number });
      }));
      for (const date of dated) await this.client.put(`/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/style`, { appendStyle: { range: date.range, style: { formatter: 'yyyy-mm-dd' } } });
      try { await this.client.post(`/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/values_batch_update`, { valueRanges }); }
      catch (error) {
        const recovered = resolveCommittedRows((await this.reader.readTable({ sheetId: this.sheetId, noHeader: true })).data, identities);
        if (recovered.kind === 'all') return { rows: recovered.rows, verified: true, reconciliation: 'PASS', status: 'VERIFIED', movementIds: identities.map((item) => item.movementId) };
        if (recovered.kind === 'partial') throw new Error('PARTIAL_IDEMPOTENCY_CONFLICT');
        if (attempt + 1 < MAX_APPEND_ATTEMPTS) continue;
        throw error;
      }
      const afterRaw = await this.readRange(targetRange, 'UnformattedValue');
      const afterFormatted = await this.readRange(targetRange, 'FormattedValue');
      const afterFormula = await this.readRange(targetRange, 'Formula');
      prepared.forEach((item, offset) => verifyPreparedRow(item.proposedCells, afterRaw[offset] ?? [], afterFormatted[offset] ?? []));
      verifyProtectedUnchanged(beforeFormula, afterFormula);
      return { rows, verified: true, reconciliation: 'PASS', ...(context ? { status: 'VERIFIED' as const, movementIds: identities.map((item) => item.movementId) } : {}) };
    }
    throw new Error('LEDGER_APPEND_CONTENTION');
  }

  private async readRange(range: string, option: 'UnformattedValue' | 'FormattedValue' | 'Formula'): Promise<unknown[][]> {
    const data = await this.client.get<{ valueRange?: { values?: unknown[][] } }>(
      `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/values/${encodeURIComponent(`${this.sheetId}!${range}`)}`,
      { valueRenderOption: option },
    );
    return data.valueRange?.values ?? [];
  }
}

export interface MovementIdentity { commandId: string; movementId: string; idempotencyKey: string; sourceFingerprint: string }

export function createMovementIdentity(input: NonNullable<ReturnType<typeof prepareLedgerWrite>['normalized']>, commandId = `CMD-${crypto.randomUUID()}`, index = 0): MovementIdentity {
  const stable = JSON.stringify({ date: input.date, outboundDate: input.outboundDate, action: input.action, shNo: input.shNo, pickupCode: input.pickupCode, sku: input.sku, sn: input.sn, qty: input.qty, fromLocation: input.fromLocation, toLocation: input.toLocation, erpWarehouse: input.erpWarehouse, stockCondition: input.stockCondition });
  const sourceFingerprint = createHash('sha256').update(stable).digest('hex').slice(0, 20).toUpperCase();
  const execution = createHash('sha256').update(`${commandId}:${index}`).digest('hex').slice(0, 20).toUpperCase();
  return { commandId, movementId: `MOV-${execution}`, idempotencyKey: `IDEM-${execution}`, sourceFingerprint: `SRC-${sourceFingerprint}` };
}

function appendSystemMarker(remark: string, identity: MovementIdentity, createdBy: string): string {
  const humanRemark = remark.trim();
  const operator = createdBy.trim().replace(/[\r\n\t;=]/g, '').slice(0, 100) || 'UNKNOWN_OPERATOR';
  return `${humanRemark ? `${humanRemark}\n` : ''}[SYSTEM_NATIVE] commandId=${identity.commandId}; movementId=${identity.movementId}; idempotencyKey=${identity.idempotencyKey}; sourceFingerprint=${identity.sourceFingerprint}; createdBy=${operator}; createdAt=${new Date().toISOString()}; source=WAREHOUSE_APP`;
}

export function parseSystemLedgerMarker(remark: unknown): Partial<MovementIdentity> {
  const marker = /\[SYSTEM_NATIVE\]\s*([^\n]*)/.exec(String(remark ?? ''))?.[1] ?? '';
  return Object.fromEntries([...marker.matchAll(/\b(commandId|movementId|idempotencyKey|sourceFingerprint)=([^;\s]+)/g)].map((match) => [match[1]!, match[2]!])) as Partial<MovementIdentity>;
}

function resolveCommittedRows(rows: readonly unknown[][], identities: readonly MovementIdentity[]): { kind: 'none' } | { kind: 'all'; rows: number[] } | { kind: 'partial' } | { kind: 'mismatch' } {
  const rowByKey = new Map<string, { row: number; marker: Partial<MovementIdentity> }>();
  rows.forEach((row, index) => {
    const marker = parseSystemLedgerMarker(row[COLUMN_INDEX.V!] ?? '');
    if (marker.idempotencyKey) rowByKey.set(marker.idempotencyKey, { row: index + 1, marker });
  });
  const committed = identities.map((identity) => rowByKey.get(identity.idempotencyKey));
  const found = committed.filter(Boolean);
  if (!found.length) return { kind: 'none' };
  if (found.length !== identities.length) return { kind: 'partial' };
  if (committed.some((item, index) => item!.marker.sourceFingerprint !== identities[index]!.sourceFingerprint)) return { kind: 'mismatch' };
  return { kind: 'all', rows: committed.map((item) => item!.row) };
}

export function nextAppendBusinessRow(data: Array<Array<unknown>>): number {
  for (let index = data.length - 1; index >= 1; index -= 1) {
    if (BUSINESS_COLUMNS.some((column) => !blank(data[index]?.[COLUMN_INDEX[column]!]))) return index + 2;
  }
  return 2;
}

function rowsBlank(rows: unknown[][], expected: number): boolean {
  return Array.from({ length: expected }, (_, offset) => BUSINESS_COLUMNS.every((column) => blank(rows[offset]?.[COLUMN_INDEX[column]!])))
    .every(Boolean);
}

function verifyPreparedRow(cells: ProposedLedgerCell[], raw: unknown[], formatted: unknown[]): void {
  for (const cell of cells) {
    const index = COLUMN_INDEX[cell.column]!;
    if (cell.valueType === 'date') {
      if (typeof raw[index] !== 'number' || raw[index] !== cell.value) throw new Error(`POST_WRITE_DATE_TYPE_MISMATCH:${cell.column}`);
      if (String(formatted[index] ?? '').slice(0, 10) !== dateSerialToIso(cell.value as number)) throw new Error(`POST_WRITE_DATE_FORMAT_MISMATCH:${cell.column}`);
    } else if (cell.valueType === 'number') {
      if (typeof raw[index] !== 'number' || raw[index] !== cell.value) throw new Error(`POST_WRITE_NUMBER_MISMATCH:${cell.column}`);
    } else if (String(raw[index] ?? '') !== String(cell.value)) throw new Error(`POST_WRITE_TEXT_MISMATCH:${cell.column}`);
  }
}

function verifyProtectedUnchanged(before: unknown[][], after: unknown[][]): void {
  const length = Math.max(before.length, after.length);
  for (let row = 0; row < length; row += 1) for (const column of PROTECTED_COLUMNS) {
    const index = COLUMN_INDEX[column]!;
    if (String(before[row]?.[index] ?? '') !== String(after[row]?.[index] ?? '')) throw new Error(`PROTECTED_FORMULA_CHANGED:${column}`);
  }
}

function blank(value: unknown): boolean { return value === undefined || value === null || value === ''; }
function resolveCommandId(value: string | undefined): string { if (value === undefined) return `CMD-${crypto.randomUUID()}`; if (!/^CMD-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new TypeError('INVALID_COMMAND_ID'); return value.toUpperCase(); }
function columnName(index: number): string { let value = '', current = index; while (current > 0) { current -= 1; value = String.fromCharCode(65 + current % 26) + value; current = Math.floor(current / 26); } return value; }
function dateSerialToIso(serial: number): string { return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10); }

export function openApiLedgerWriterFromEnv(): OpenApiLedgerWriter {
  const spreadsheetToken = requiredEnv('FEISHU_SPREADSHEET_TOKEN');
  const sheetId = requiredEnv('FEISHU_MAIN_SHEET_ID');
  const client = openApiClientFromEnv();
  return new OpenApiLedgerWriter(spreadsheetToken, sheetId, client, new FeishuOpenApiWarehouseSheetReader(spreadsheetToken, client));
}
