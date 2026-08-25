import { parseBusinessDateString } from '../ledger/businessDate.js';
import { validateLedgerInput, type ValidationError } from '../ledger/validators.js';
import type { ParsedReturnBatch } from '../workOrders/returnXlsxParser.js';

export const RETURN_REPAIR_LOCATION = 'REPAIR-01' as const;

export interface ReturnLinePreview {
  sourceRow?: number;
  action: '退回维修';
  businessDate: string;
  sh?: string;
  sku?: string;
  model?: string;
  sn: string;
  qty: 1;
  targetLocation: typeof RETURN_REPAIR_LOCATION;
  stockCondition: '待修';
  valid: boolean;
  errors: ValidationError[];
}

export interface ReturnBatchPreview {
  mode: 'PREVIEW_ONLY';
  zeroWritesPerformed: true;
  sourceFileName?: string;
  sh?: string;
  targetLocation: typeof RETURN_REPAIR_LOCATION;
  lines: ReturnLinePreview[];
  warnings: string[];
}

export function prepareReturnBatchPreview(parsed: ParsedReturnBatch, businessDateInput: string): ReturnBatchPreview {
  const businessDate = parseBusinessDateString(businessDateInput);
  if (!businessDate) throw new TypeError('business date is required');
  const preview: ReturnBatchPreview = {
    mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, targetLocation: RETURN_REPAIR_LOCATION,
    lines: [], warnings: [...parsed.warnings],
  };
  if (parsed.sourceFileName) preview.sourceFileName = parsed.sourceFileName;
  if (parsed.shNo) preview.sh = parsed.shNo;
  if (parsed.confidence !== 'high') return preview;
  preview.lines = parsed.lines.map((line) => {
    const validation = validateLedgerInput({
      action: '退回维修', date: businessDate, sn: line.sn, qty: line.qty,
      toLocation: RETURN_REPAIR_LOCATION, stockCondition: '待修',
      ...(parsed.shNo ? { shNo: parsed.shNo } : {}),
      ...(line.sku ? { sku: line.sku } : {}),
    });
    return {
      action: '退回维修', businessDate, sn: line.sn, qty: 1,
      targetLocation: RETURN_REPAIR_LOCATION, stockCondition: '待修',
      valid: validation.ok, errors: validation.errors,
      ...(parsed.shNo ? { sh: parsed.shNo } : {}),
      ...(line.sku ? { sku: line.sku } : {}),
      ...(line.model ? { model: line.model } : {}),
      ...(line.sourceRow !== undefined ? { sourceRow: line.sourceRow } : {}),
    };
  });
  return preview;
}
