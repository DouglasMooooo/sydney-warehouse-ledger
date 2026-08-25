import { identifySectionHeading, WORK_ORDER_SECTION } from './sectionHeadings.js';
import type { XlsxWorkbookData } from './xlsxParser.js';

export interface ParsedReturnLine {
  sn: string;
  sku?: string;
  model?: string;
  qty: number;
  sourceRow?: number;
}

export interface ParsedReturnBatch {
  shNo?: string;
  sourceFileName?: string;
  lines: ParsedReturnLine[];
  confidence: 'high' | 'needs_confirmation';
  warnings: string[];
}

/** Reads Faulty Unit rows only. Replacement rows can never enter this result. */
export function parseReturnXlsxWorkbookData(workbook: XlsxWorkbookData, sourceFileName?: string): ParsedReturnBatch {
  const warnings: string[] = [];
  const lines: ParsedReturnLine[] = [];
  let shNo: string | undefined;
  for (const sheet of workbook.sheets) {
    shNo ??= findSh(sheet.rows);
    const titleRow = sheet.rows.findIndex((row) => rowSection(row) === WORK_ORDER_SECTION.FAULTY_UNIT);
    if (titleRow < 0) continue;
    let headerRow = -1;
    let indexes: ReturnType<typeof headerIndexes>;
    for (let index = titleRow + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index]!;
      if (rowSection(row) !== undefined) break;
      indexes = headerIndexes(row);
      if (indexes) { headerRow = index; break; }
    }
    if (headerRow < 0 || !indexes) {
      warnings.push(`FAULTY_HEADER_NOT_FOUND:${sheet.name}`);
      continue;
    }
    for (let index = headerRow + 1; index < sheet.rows.length; index += 1) {
      const row = sheet.rows[index]!;
      if (rowSection(row) !== undefined || row.every((cell) => !text(cell))) break;
      const sn = text(row[indexes.sn]);
      const sku = indexes.sku === undefined ? '' : text(row[indexes.sku]);
      const model = indexes.model === undefined ? '' : text(row[indexes.model]);
      const qtyText = indexes.qty === undefined ? '' : text(row[indexes.qty]);
      const qty = qtyText ? Number(qtyText) : 1;
      if (!sn || !Number.isInteger(qty) || qty !== 1) {
        warnings.push(`FAULTY_LINE_INVALID:${sheet.name}:${index + 1}`);
        continue;
      }
      lines.push({ sn, qty, sourceRow: index + 1, ...(sku ? { sku } : {}), ...(model ? { model } : {}) });
    }
  }
  if (lines.length === 0 && warnings.length === 0) warnings.push('FAULTY_SECTION_NOT_FOUND');
  const result: ParsedReturnBatch = {
    lines,
    confidence: lines.length > 0 && warnings.length === 0 ? 'high' : 'needs_confirmation',
    warnings,
  };
  if (shNo) result.shNo = shNo;
  if (sourceFileName) result.sourceFileName = sourceFileName;
  return result;
}

function headerIndexes(row: unknown[]): { sn: number; sku?: number; model?: number; qty?: number } | undefined {
  const normalized = row.map(normalizeFieldHeader);
  const sn = normalized.findIndex((cell) => cell === 'sn' || cell.includes('productsn') || cell.includes('机器唯一码'));
  if (sn < 0) return undefined;
  const sku = normalized.findIndex((cell) => cell === 'sku' || cell.includes('partno') || cell.includes('料号'));
  const model = normalized.findIndex((cell) => cell === 'model' || cell.includes('modelname') || cell.includes('机型'));
  const qty = normalized.findIndex((cell) => cell === 'qty' || cell === 'quantity' || cell === '数量');
  return {
    sn,
    ...(sku >= 0 ? { sku } : {}),
    ...(model >= 0 ? { model } : {}),
    ...(qty >= 0 ? { qty } : {}),
  };
}

function findSh(rows: unknown[][]): string | undefined {
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      const value = text(row[index]);
      const inline = /^SH(?:\s*(?:No\.?|Number))?\s*[:：-]\s*(.+)$/i.exec(value)?.[1]?.trim();
      if (inline) return inline;
      if (normalizeFieldHeader(value).includes('shticketno')) {
        const adjacent = text(row[index + 1]);
        if (/^SH-/i.test(adjacent)) return adjacent;
      }
    }
  }
  return undefined;
}

function rowSection(row: unknown[]): ReturnType<typeof identifySectionHeading> {
  for (const cell of row) {
    const section = identifySectionHeading(cell);
    if (section !== undefined) return section;
  }
  return undefined;
}

function normalizeFieldHeader(value: unknown): string {
  return text(value).toLowerCase().replace(/^[*#\d.\s]+/, '').replace(/[：:（）()\s_\-/]+/g, '');
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
