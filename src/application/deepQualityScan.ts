import { DEEP_QUALITY_EXCEPTION_CODES, qualityIssueToOperationalException, type OperationalException } from './exceptionService.js';
import { cellsByAddress, readRange } from '../feishu/read.js';
import { openApiClientFromEnv, type FeishuOpenApiClient } from '../feishu/openApiClient.js';
import type { FeishuCell } from '../feishu/types.js';
import type { LedgerScanRow, QualityCode } from '../quality/types.js';
import { scanLedger } from '../quality/scanLedger.js';
import { warehouseSheetReaderFromEnv } from '../feishu/sheetReader.js';

export interface DeepQualitySource {
  readLedgerRows(): Promise<LedgerScanRow[]>;
  readValidLocations(): Promise<Set<string>>;
}

export interface DeepQualityScanResult {
  status: 'completed';
  scannedAt: string;
  scannedRows: number;
  issueCount: number;
  ruleCoverage: Array<{ code: string; executed: true }>;
  exceptions: OperationalException[];
}

export async function runDeepQualityScan(
  source: DeepQualitySource = deepQualitySourceFromEnv(),
  now: Date = new Date(),
): Promise<DeepQualityScanResult> {
  const [rows, locations] = await Promise.all([source.readLedgerRows(), source.readValidLocations()]);
  const report = scanLedger(rows, locations);
  const deepCodes = new Set<string>(DEEP_QUALITY_EXCEPTION_CODES);
  const exceptions = report.issues.filter((issue) => deepCodes.has(issue.code)).map(qualityIssueToOperationalException);
  return {
    status: 'completed', scannedAt: now.toISOString(), scannedRows: rows.length, issueCount: exceptions.length,
    ruleCoverage: DEEP_QUALITY_EXCEPTION_CODES.map((code) => ({ code, executed: true as const })), exceptions,
  };
}

export class LarkCliDeepQualitySource implements DeepQualitySource {
  constructor(private readonly url: string, private readonly mainSheetId: string, private readonly currentInventorySheetId: string, private readonly lastRow = 2342) {}
  async readLedgerRows(): Promise<LedgerScanRow[]> {
    const rows: LedgerScanRow[] = [];
    for (let start = 2; start <= this.lastRow; start += 100) {
      const end = Math.min(start + 99, this.lastRow);
      const data = readRange({ spreadsheetUrl: this.url, sheetId: this.mainSheetId, range: `A${start}:AC${end}`, include: ['value', 'formula', 'data_validation'] });
      for (const range of data.ranges) range.cells.forEach((cells, index) => {
        const row = range.row_indices[index]; if (row !== undefined) rows.push({ row, cells: Object.fromEntries(range.col_indices.map((column, offset) => [column, cells[offset] ?? {}])) });
      });
    }
    return rows;
  }
  async readValidLocations(): Promise<Set<string>> {
    const cells = cellsByAddress(readRange({ spreadsheetUrl: this.url, sheetId: this.currentInventorySheetId, range: 'N2:N1000', include: ['value'] }));
    return new Set([...cells.values()].map((cell) => String(cell.value ?? '').trim()).filter(Boolean));
  }
}

export class OpenApiDeepQualitySource implements DeepQualitySource {
  constructor(private readonly token: string, private readonly mainSheetId: string, private readonly client: FeishuOpenApiClient, private readonly lastRow = 2342) {}
  async readLedgerRows(): Promise<LedgerScanRow[]> {
    const rows: LedgerScanRow[] = [];
    for (let start = 2; start <= this.lastRow; start += 200) {
      const end = Math.min(start + 199, this.lastRow);
      const [values, formulas] = await Promise.all([this.matrix(`A${start}:AC${end}`, 'UnformattedValue'), this.matrix(`A${start}:AC${end}`, 'Formula')]);
      const count = Math.max(values.length, formulas.length);
      for (let offset = 0; offset < count; offset += 1) {
        const cells: Record<string, FeishuCell> = {};
        for (let column = 0; column < 29; column += 1) {
          const value = values[offset]?.[column];
          const rendered = formulas[offset]?.[column];
          const cell: FeishuCell = {};
          if (value !== undefined) cell.value = value;
          if (typeof rendered === 'string' && rendered.startsWith('=')) cell.formula = rendered;
          if (column < 2) cell.data_type = typeof value === 'number' ? 'number' : typeof value === 'string' ? 'text' : 'empty';
          cells[columnName(column + 1)] = cell;
        }
        rows.push({ row: start + offset, cells });
      }
    }
    return rows;
  }
  async readValidLocations(): Promise<Set<string>> {
    const table = await warehouseSheetReaderFromEnv().readTable({ sheetName: '库位维护' });
    const index = table.columns.findIndex((column) => /库位编码|location/i.test(column));
    return new Set(table.data.map((row) => String(row[index] ?? '').trim()).filter(Boolean));
  }
  private async matrix(range: string, render: 'UnformattedValue' | 'Formula'): Promise<unknown[][]> {
    const data = await this.client.get<{ valueRange?: { values?: unknown[][] } }>(
      `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.token)}/values/${encodeURIComponent(`${this.mainSheetId}!${range}`)}`,
      { valueRenderOption: render },
    );
    return data.valueRange?.values ?? [];
  }
}

export function deepQualitySourceFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): DeepQualitySource {
  const url = env.FEISHU_SPREADSHEET_URL?.trim();
  const token = env.FEISHU_SPREADSHEET_TOKEN?.trim() ?? (url ? /\/sheets\/([^/?#]+)/.exec(url)?.[1] : undefined);
  const main = required(env, 'FEISHU_MAIN_SHEET_ID');
  const lastRow = Number(env.FEISHU_MAIN_LAST_ROW ?? 2342);
  const mode = env.FEISHU_READ_ADAPTER?.trim() || (env.NODE_ENV === 'production' ? 'openapi' : 'lark-cli');
  if (mode === 'openapi') {
    if (!token) throw new Error('FEISHU_SPREADSHEET_TOKEN is required.');
    return new OpenApiDeepQualitySource(token, main, openApiClientFromEnv(env), lastRow);
  }
  if (!url) throw new Error('FEISHU_SPREADSHEET_URL is required.');
  return new LarkCliDeepQualitySource(url, main, required(env, 'FEISHU_CURRENT_INVENTORY_SHEET_ID'), lastRow);
}

function required(env: Readonly<Record<string, string | undefined>>, name: string): string { const value = env[name]?.trim(); if (!value) throw new Error(`${name} is required.`); return value; }
function columnName(index: number): string { let result = '', n = index; while (n > 0) { n -= 1; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); } return result; }
