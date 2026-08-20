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
  const envelope = runLarkCli<LarkEnvelope<TableGetData>>([
    'sheets', '+table-get', '--url', input.spreadsheetUrl, '--sheet-id', input.sheetId,
    '--range', input.range, '--no-header',
  ]);
  if (!envelope.ok) throw new Error(envelope.error?.message ?? 'Feishu typed read failed');
  const sheet = envelope.data.sheets[0];
  if (!sheet) throw new Error(`No typed sheet returned for ${input.range}`);
  return sheet;
}
