import { BUSINESS_COLUMNS, PROTECTED_COLUMNS } from '../config/ledgerSchema.js';
import type { LedgerWriteInput, ProposedLedgerCell } from '../ledger/typedWrite.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import { requiredEnv } from './client.js';
import { openApiClientFromEnv, type FeishuOpenApiClient } from './openApiClient.js';
import { FeishuOpenApiWarehouseSheetReader } from './sheetReader.js';
import type { WarehouseSheetReader } from './sheetReader.js';

export interface ConfirmedOpenApiWrite { rows: number[]; verified: true; reconciliation: 'PASS' }

const COLUMN_INDEX = Object.fromEntries(Array.from({ length: 29 }, (_, index) => [columnName(index + 1), index])) as Record<string, number>;

export class OpenApiLedgerWriter {
  constructor(
    private readonly spreadsheetToken: string,
    private readonly sheetId: string,
    private readonly client: FeishuOpenApiClient,
    private readonly reader: WarehouseSheetReader,
  ) {}

  async append(inputs: readonly LedgerWriteInput[]): Promise<ConfirmedOpenApiWrite> {
    if (!inputs.length || inputs.length > 100) throw new TypeError('一次写入必须包含 1–100 行。');
    const prepared = inputs.map((input) => prepareLedgerWrite(input, false));
    const invalid = prepared.find((item) => !item.ok);
    if (invalid) throw new TypeError(`LEDGER_VALIDATION_FAILED:${invalid.errors.map((item) => item.code).join(',')}`);
    const table = await this.reader.readTable({ sheetId: this.sheetId, noHeader: true });
    const firstRow = nextBlankBusinessRow(table.data);
    const rows = inputs.map((_, index) => firstRow + index);
    const targetRange = `A${firstRow}:AC${rows[rows.length - 1]!}`;
    const beforeRaw = await this.readRange(targetRange, 'UnformattedValue');
    assertRowsBlank(beforeRaw, inputs.length);
    const beforeFormula = await this.readRange(targetRange, 'Formula');

    const valueRanges: Array<{ range: string; values: unknown[][] }> = [];
    const dated: Array<{ range: string; serial: number }> = [];
    prepared.forEach((item, rowOffset) => item.proposedCells.forEach((cell) => {
      const row = firstRow + rowOffset;
      valueRanges.push({ range: `${this.sheetId}!${cell.column}${row}:${cell.column}${row}`, values: [[cell.value]] });
      if (cell.valueType === 'date') dated.push({ range: `${this.sheetId}!${cell.column}${row}:${cell.column}${row}`, serial: cell.value as number });
    }));
    for (const date of dated) await this.client.put(`/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/style`, {
      appendStyle: { range: date.range, style: { formatter: 'yyyy-mm-dd' } },
    });
    await this.client.post(`/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/values_batch_update`, { valueRanges });

    const afterRaw = await this.readRange(targetRange, 'UnformattedValue');
    const afterFormatted = await this.readRange(targetRange, 'FormattedValue');
    const afterFormula = await this.readRange(targetRange, 'Formula');
    prepared.forEach((item, offset) => verifyPreparedRow(item.proposedCells, afterRaw[offset] ?? [], afterFormatted[offset] ?? []));
    verifyProtectedUnchanged(beforeFormula, afterFormula);
    return { rows, verified: true, reconciliation: 'PASS' };
  }

  private async readRange(range: string, option: 'UnformattedValue' | 'FormattedValue' | 'Formula'): Promise<unknown[][]> {
    const data = await this.client.get<{ valueRange?: { values?: unknown[][] } }>(
      `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/values/${encodeURIComponent(`${this.sheetId}!${range}`)}`,
      { valueRenderOption: option },
    );
    return data.valueRange?.values ?? [];
  }
}

function nextBlankBusinessRow(data: Array<Array<unknown>>): number {
  for (let index = 1; index < data.length; index += 1) {
    if (BUSINESS_COLUMNS.every((column) => blank(data[index]?.[COLUMN_INDEX[column]!]))) return index + 1;
  }
  return Math.max(2, data.length + 1);
}

function assertRowsBlank(rows: unknown[][], expected: number): void {
  for (let offset = 0; offset < expected; offset += 1) {
    if (!BUSINESS_COLUMNS.every((column) => blank(rows[offset]?.[COLUMN_INDEX[column]!]))) throw new Error('STALE_WRITE_CONFLICT');
  }
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
function columnName(index: number): string { let value = '', current = index; while (current > 0) { current -= 1; value = String.fromCharCode(65 + current % 26) + value; current = Math.floor(current / 26); } return value; }
function dateSerialToIso(serial: number): string { return new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000).toISOString().slice(0, 10); }

export function openApiLedgerWriterFromEnv(): OpenApiLedgerWriter {
  const spreadsheetToken = requiredEnv('FEISHU_SPREADSHEET_TOKEN');
  const sheetId = requiredEnv('FEISHU_MAIN_SHEET_ID');
  const client = openApiClientFromEnv();
  return new OpenApiLedgerWriter(spreadsheetToken, sheetId, client, new FeishuOpenApiWarehouseSheetReader(spreadsheetToken, client));
}
