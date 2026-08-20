import type { WorkOrderParser } from './parser.js';
import { identifySectionHeading, WORK_ORDER_SECTION } from './sectionHeadings.js';
import type { ParsedReplacementLine, ParsedWorkOrder, TextWorkOrderSource } from './types.js';

export class PlainTextWorkOrderParser implements WorkOrderParser<TextWorkOrderSource> {
  readonly format = 'text' as const;

  parse(source: TextWorkOrderSource): ParsedWorkOrder {
    return parsePlainTextWorkOrder(source);
  }
}

export function parsePlainTextWorkOrder(source: TextWorkOrderSource): ParsedWorkOrder {
  const lines = source.sourceText.split(/\r?\n/);
  const titleIndex = lines.findIndex((line) => identifySectionHeading(line) === WORK_ORDER_SECTION.REPLACEMENT_UNIT);
  const shNo = findSh(lines);
  const warnings: string[] = [];
  const result: ParsedWorkOrder = { replacementLines: [], confidence: 'needs_confirmation', warnings };
  if (shNo) result.shNo = shNo;
  if (source.sourceFileName) result.sourceFileName = source.sourceFileName;
  if (titleIndex < 0) {
    warnings.push('REPLACEMENT_SECTION_NOT_FOUND');
    return result;
  }

  const section = sectionLines(lines, titleIndex + 1);
  result.replacementLines = parseKeyValueReplacementLines(section, warnings);
  if (result.replacementLines.length === 0 && warnings.length === 0) warnings.push('REPLACEMENT_SECTION_EMPTY');
  result.confidence = result.replacementLines.length > 0 && warnings.length === 0 ? 'high' : 'needs_confirmation';
  return result;
}

function sectionLines(lines: string[], start: number): Array<{ text: string; sourceRow: number }> {
  const result: Array<{ text: string; sourceRow: number }> = [];
  for (let index = start; index < lines.length; index += 1) {
    if (identifySectionHeading(lines[index]) !== undefined) break;
    result.push({ text: lines[index]!, sourceRow: index + 1 });
  }
  return result;
}

function parseKeyValueReplacementLines(
  lines: Array<{ text: string; sourceRow: number }>,
  warnings: string[],
): ParsedReplacementLine[] {
  const results: ParsedReplacementLine[] = [];
  let current: { sku?: string; qty?: number; erpWarehouse?: string; sourceRow?: number; invalid?: boolean } = {};
  const flush = () => {
    if (!current.sku && current.qty === undefined && !current.erpWarehouse) return;
    if (current.sku && current.qty !== undefined && current.erpWarehouse && !current.invalid) {
      const line: ParsedReplacementLine = {
        sku: current.sku, qty: current.qty, erpWarehouse: current.erpWarehouse,
      };
      if (current.sourceRow !== undefined) line.sourceRow = current.sourceRow;
      results.push(line);
    } else {
      warnings.push(`REPLACEMENT_LINE_INCOMPLETE:${current.sourceRow ?? 'unknown'}`);
    }
    current = {};
  };

  for (const line of lines) {
    const sku = /^\s*(?:Replacement(?:\s+Unit)?(?:\s+SKU)?|SKU)\s*[:：-]\s*(.+?)\s*$/i.exec(line.text)?.[1]?.trim();
    if (sku) {
      if (current.sku) flush();
      current.sku = sku;
      current.sourceRow = line.sourceRow;
      continue;
    }
    const qtyText = /^\s*(?:Replacement\s+)?Qty\s*[:：-]\s*(.+?)\s*$/i.exec(line.text)?.[1]?.trim();
    if (qtyText !== undefined) {
      const qty = Number(qtyText);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
        current.invalid = true;
        warnings.push(`REPLACEMENT_QTY_INVALID:${line.sourceRow}`);
      } else current.qty = qty;
      continue;
    }
    const warehouse = /^\s*ERP\s*Warehouse\s*[:：-]\s*(.+?)\s*$/i.exec(line.text)?.[1]?.trim();
    if (warehouse) current.erpWarehouse = warehouse;
  }
  flush();
  return results;
}

function findSh(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = /^\s*SH(?:\s*(?:No\.?|Number))?\s*[:：-]\s*(.+?)\s*$/i.exec(line);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return undefined;
}
