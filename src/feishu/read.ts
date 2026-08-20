import { runLarkCli } from './client.js';
import type { CellsGetData, FeishuCell, LarkEnvelope, TableGetData, TypedSheetData } from './types.js';

export interface ReadRangeInput {
  spreadsheetUrl: string;
  sheetId: string;
  range: string;
  include?: Array<'value' | 'formula' | 'style' | 'comment' | 'data_validation'>;
}

export function readRange(input: ReadRangeInput): CellsGetData {
  const include = input.include ?? ['formula', 'data_validation'];
  const envelope = runLarkCli<LarkEnvelope<CellsGetData>>([
    'sheets', '+cells-get', '--url', input.spreadsheetUrl, '--sheet-id', input.sheetId,
    '--range', input.range, '--include', include.join(','),
  ]);
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'Feishu read failed');
  if (envelope.data.has_more) throw new Error(`Truncated Feishu read for ${input.range}`);
  return envelope.data;
}

export function cellsByAddress(data: CellsGetData): Map<string, FeishuCell> {
  const result = new Map<string, FeishuCell>();
  for (const range of data.ranges) {
    range.cells.forEach((row, rowOffset) => {
      const rowNumber = range.row_indices[rowOffset];
      if (rowNumber === undefined) return;
      row.forEach((cell, colOffset) => {
        const column = range.col_indices[colOffset];
        if (column) result.set(`${column}${rowNumber}`, cell);
      });
    });
  }
  return result;
}

export function readCells(input: ReadRangeInput): Map<string, FeishuCell> {
  return cellsByAddress(readRange(input));
}

export function readTypedRange(input: Omit<ReadRangeInput, 'include'>): TypedSheetData {
  return readTypedTable({ ...input, noHeader: true });
}

export interface ReadTypedTableInput {
  spreadsheetUrl: string;
  sheetId?: string;
  sheetName?: string;
  range?: string;
  noHeader?: boolean;
}

export function readTypedTable(input: ReadTypedTableInput): TypedSheetData {
  if ((input.sheetId === undefined) === (input.sheetName === undefined)) {
    throw new Error('Exactly one of sheetId/sheetName is required');
  }
  const args = ['sheets', '+table-get', '--url', input.spreadsheetUrl];
  if (input.sheetId) args.push('--sheet-id', input.sheetId);
  if (input.sheetName) args.push('--sheet-name', input.sheetName);
  if (input.range) args.push('--range', input.range);
  if (input.noHeader) args.push('--no-header');
  const envelope = runLarkCli<LarkEnvelope<TableGetData>>([
    ...args,
  ]);
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'Feishu typed table read failed');
  const sheet = envelope.data.sheets[0];
  if (!sheet) throw new Error(`No typed sheet returned${input.range ? ` for ${input.range}` : ''}`);
  return sheet;
}
