import type { WorkOrderParser } from './parser.js';
import type { ParsedReplacementLine, ParsedWorkOrder } from './types.js';

export interface XlsxWorksheetData {
  name: string;
  rows: unknown[][];
}

export interface XlsxWorkbookData {
  sheets: XlsxWorksheetData[];
}

/** Binary decoding boundary for a future maintained local XLSX dependency. */
export interface XlsxWorkbookReader {
  read(bytes: Uint8Array): Promise<XlsxWorkbookData>;
}

export interface XlsxWorkOrderSource {
  bytes: Uint8Array;
  sourceFileName?: string;
}

export class XlsxWorkOrderParser implements WorkOrderParser<XlsxWorkOrderSource> {
  readonly format = 'xlsx' as const;

  constructor(private readonly reader: XlsxWorkbookReader) {}

  async parse(source: XlsxWorkOrderSource): Promise<ParsedWorkOrder> {
    return parseXlsxWorkbookData(await this.reader.read(source.bytes), source.sourceFileName);
  }
}

/** Testable worksheet-matrix parser; production binary XLSX decoding is not wired in this iteration. */
export function parseXlsxWorkbookData(workbook: XlsxWorkbookData, sourceFileName?: string): ParsedWorkOrder {
  const warnings: string[] = [];
  const replacementLines: ParsedReplacementLine[] = [];
  let shNo: string | undefined;
  for (const sheet of workbook.sheets) {
    shNo ??= findSh(sheet.rows);
    const titleRow = sheet.rows.findIndex((row) => row.some((cell) => text(cell) === 'Replacement Unit information'));
    if (titleRow < 0) continue;
    let headerRow = -1;
    for (let index = titleRow + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index]!;
      if (row.some((cell) => /information$/i.test(text(cell)))) break;
      if (headerIndexes(row)) { headerRow = index; break; }
    }
    if (headerRow < 0) {
      warnings.push(`REPLACEMENT_HEADER_NOT_FOUND:${sheet.name}`);
      continue;
    }
    const indexes = headerIndexes(sheet.rows[headerRow]!)!;
    for (let index = headerRow + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index]!;
      if (row.some((cell) => /information$/i.test(text(cell))) || row.every((cell) => !text(cell))) break;
      const sku = text(row[indexes.sku]);
      const qtyText = text(row[indexes.qty]);
      const erpWarehouse = text(row[indexes.erpWarehouse]);
      if (!sku && !qtyText && !erpWarehouse) break;
      const qty = Number(qtyText);
      if (!sku || !erpWarehouse || !Number.isInteger(qty) || qty <= 0) {
        warnings.push(`REPLACEMENT_LINE_INVALID:${sheet.name}:${index + 1}`);
        continue;
      }
      replacementLines.push({ sku, qty, erpWarehouse, sourceRow: index + 1 });
    }
  }
  if (replacementLines.length === 0 && warnings.length === 0) warnings.push('REPLACEMENT_SECTION_NOT_FOUND');
  const result: ParsedWorkOrder = {
    replacementLines,
    confidence: replacementLines.length > 0 && warnings.length === 0 ? 'high' : 'needs_confirmation',
    warnings,
  };
  if (shNo) result.shNo = shNo;
  if (sourceFileName) result.sourceFileName = sourceFileName;
  return result;
}

function headerIndexes(row: unknown[]): { sku: number; qty: number; erpWarehouse: number } | undefined {
  const normalized = row.map((cell) => text(cell).toLowerCase().replace(/\s+/g, ' '));
  const sku = normalized.findIndex((cell) => cell === 'sku' || cell === 'replacement sku');
  const qty = normalized.findIndex((cell) => cell === 'qty' || cell === 'quantity');
  const erpWarehouse = normalized.findIndex((cell) => cell === 'erp warehouse');
  return sku >= 0 && qty >= 0 && erpWarehouse >= 0 ? { sku, qty, erpWarehouse } : undefined;
}

function findSh(rows: unknown[][]): string | undefined {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const value = text(row[index]);
      const inline = /^SH(?:\s*(?:No\.?|Number))?\s*[:：-]\s*(.+)$/i.exec(value)?.[1]?.trim();
      if (inline) return inline;
      if (/^SH(?:\s*(?:No\.?|Number))?$/i.test(value)) {
        const adjacent = text(row[index + 1]);
        if (adjacent) return adjacent;
      }
    }
  }
  return undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
