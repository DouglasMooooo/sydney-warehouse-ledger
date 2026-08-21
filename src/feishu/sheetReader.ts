import { readTypedTable, type ReadTypedTableInput } from './read.js';
import type { TypedSheetData } from './types.js';
import { FeishuOpenApiClient, openApiClientFromEnv } from './openApiClient.js';

export interface WarehouseSheetReader {
  readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData>;
  healthCheck(): Promise<boolean>;
}

export class LarkCliWarehouseSheetReader implements WarehouseSheetReader {
  constructor(private readonly spreadsheetUrl: string) {}
  async readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData> {
    return readTypedTable({ spreadsheetUrl: this.spreadsheetUrl, ...input });
  }
  async healthCheck(): Promise<boolean> {
    try { await this.readTable({ sheetName: '库位维护', range: 'A1:A2' }); return true; } catch { return false; }
  }
}

interface SheetInfo { sheet_id: string; title: string; grid_properties?: { row_count?: number; column_count?: number } }

export class FeishuOpenApiWarehouseSheetReader implements WarehouseSheetReader {
  private sheets?: SheetInfo[];
  constructor(private readonly spreadsheetToken: string, private readonly client: FeishuOpenApiClient) {}

  async readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData> {
    const sheet = await this.resolveSheet(input);
    const range = input.range ?? `A1:${columnName(Math.min(sheet.grid_properties?.column_count ?? 100, 100))}${sheet.grid_properties?.row_count ?? 5000}`;
    const data = await this.client.get<{ valueRange?: { range?: string; values?: unknown[][] } }>(
      `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/values/${encodeURIComponent(`${sheet.sheet_id}!${range}`)}`,
      { valueRenderOption: 'UnformattedValue' },
    );
    const rows = trimRows(data.valueRange?.values ?? []);
    const width = Math.max(0, ...rows.map((row) => row.length));
    const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => scalar(row[index])));
    if (input.noHeader) {
      return { name: sheet.title, range, columns: Array.from({ length: width }, (_, index) => columnName(index + 1)), data: normalized, dtypes: inferDtypes(normalized, width) };
    }
    const header = normalized[0] ?? [];
    const body = normalized.slice(1);
    const columns = Array.from({ length: width }, (_, index) => String(header[index] ?? columnName(index + 1)));
    return { name: sheet.title, range, columns, data: body, dtypes: inferDtypes(body, width, columns) };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const first = (await this.loadSheets())[0];
      if (!first) return false;
      await this.readTable({ sheetId: first.sheet_id, noHeader: true, range: 'A1:A1' });
      return true;
    } catch { return false; }
  }

  private async resolveSheet(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<SheetInfo> {
    const sheets = await this.loadSheets();
    const sheet = input.sheetId ? sheets.find((item) => item.sheet_id === input.sheetId) : sheets.find((item) => item.title === input.sheetName);
    if (!sheet) throw new Error('SYSTEM_READ_FAILED: sheet not found');
    return sheet;
  }

  private async loadSheets(): Promise<SheetInfo[]> {
    if (!this.sheets) {
      const data = await this.client.get<{ sheets?: SheetInfo[] }>(`/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(this.spreadsheetToken)}/sheets/query`);
      this.sheets = data.sheets ?? [];
    }
    return this.sheets;
  }
}

export class GoogleSheetsGvizWarehouseSheetReader implements WarehouseSheetReader {
  constructor(
    private readonly spreadsheetId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData> {
    const sheet = input.sheetName?.trim() || input.sheetId?.trim();
    if (!sheet) throw new Error('SYSTEM_READ_FAILED: Google Sheet tab is required');
    const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(this.spreadsheetId)}/gviz/tq`);
    url.searchParams.set('tqx', 'out:csv');
    url.searchParams.set('sheet', sheet);
    if (input.range?.trim()) url.searchParams.set('range', input.range.trim());
    const response = await this.fetchImpl(url, { headers: { Accept: 'text/csv' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`SYSTEM_READ_FAILED: Google Sheets returned HTTP ${response.status}`);
    const rows = trimRows(parseCsv(await response.text()).map((row) => row.map(googleCsvScalar)));
    const width = Math.max(0, ...rows.map((row) => row.length));
    const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => scalar(row[index])));
    if (input.noHeader) {
      return { name: sheet, range: input.range ?? 'used-range', columns: Array.from({ length: width }, (_, index) => columnName(index + 1)), data: normalized, dtypes: inferDtypes(normalized, width) };
    }
    const header = normalized[0] ?? [];
    const body = normalized.slice(1);
    const columns = Array.from({ length: width }, (_, index) => String(header[index] ?? columnName(index + 1)));
    return { name: sheet, range: input.range ?? 'used-range', columns, data: body, dtypes: inferDtypes(body, width, columns) };
  }

  async healthCheck(): Promise<boolean> {
    try { await this.readTable({ sheetName: '库位维护', range: 'A1:A2' }); return true; } catch { return false; }
  }
}

export function warehouseSheetReaderFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): WarehouseSheetReader {
  const url = env.FEISHU_SPREADSHEET_URL?.trim();
  const token = env.FEISHU_SPREADSHEET_TOKEN?.trim() ?? (url ? /\/sheets\/([^/?#]+)/.exec(url)?.[1] : undefined);
  const mode = env.WAREHOUSE_READ_ADAPTER?.trim() || env.FEISHU_READ_ADAPTER?.trim() || (env.NODE_ENV === 'production' ? 'openapi' : 'lark-cli');
  if (mode === 'google-sheets-gviz') {
    const spreadsheetId = env.GOOGLE_SPREADSHEET_ID?.trim();
    if (!spreadsheetId) throw new Error('GOOGLE_SPREADSHEET_ID is required for Google Sheets reads.');
    return new GoogleSheetsGvizWarehouseSheetReader(spreadsheetId);
  }
  if (mode === 'openapi') {
    if (!token) throw new Error('FEISHU_SPREADSHEET_TOKEN is required for OpenAPI reads.');
    return new FeishuOpenApiWarehouseSheetReader(token, openApiClientFromEnv(env));
  }
  if (!url) throw new Error('FEISHU_SPREADSHEET_URL is required for lark-cli reads.');
  return new LarkCliWarehouseSheetReader(url);
}

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function googleCsvScalar(value: string): string | number | boolean | null {
  if (value === '') return null;
  if (value === 'TRUE') return true;
  if (value === 'FALSE') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return value;
}

function columnName(index: number): string {
  let result = '', current = index;
  while (current > 0) { current -= 1; result = String.fromCharCode(65 + current % 26) + result; current = Math.floor(current / 26); }
  return result;
}

function scalar(value: unknown): string | number | boolean | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : value === null || value === undefined ? null : String(value);
}

function trimRows(rows: unknown[][]): unknown[][] {
  let end = rows.length;
  while (end > 0 && (rows[end - 1] ?? []).every((value) => value === '' || value === null || value === undefined)) end -= 1;
  return rows.slice(0, end);
}

function inferDtypes(rows: Array<Array<string | number | boolean | null>>, width: number, columns?: string[]): Record<string, string> {
  return Object.fromEntries(Array.from({ length: width }, (_, index) => {
    const values = rows.map((row) => row[index]).filter((value) => value !== null && value !== '');
    const dtype = values.length > 0 && values.every((value) => typeof value === 'number') ? 'number' : 'string';
    return [columns?.[index] ?? columnName(index + 1), dtype];
  }));
}
