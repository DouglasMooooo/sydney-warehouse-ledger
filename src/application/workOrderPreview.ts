import { normalizeBusinessDate, type BusinessDate } from '../ledger/businessDate.js';
import { normalizeIdentifier, normalizeQty, normalizeSH, normalizeSKU } from '../ledger/normalize.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import type { InventoryCandidate, WarehouseReadPort } from './contracts.js';
import type { WorkOrderPreviewClientDto } from './clientDtos.js';

export type WorkOrderPreviewErrorCode =
  | 'REPLACEMENT_NOT_CLEAR'
  | 'SKU_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'LOCATION_UNAVAILABLE'
  | 'INVALID_DATA'
  | 'PICKUP_CODE_UNAVAILABLE';

export interface WorkOrderPreviewError {
  code: WorkOrderPreviewErrorCode;
  message: string;
}

export interface WorkOrderPreview {
  mode: 'PREVIEW_ONLY';
  zeroWritesPerformed: true;
  businessDate?: BusinessDate;
  extracted: {
    sh?: string;
    replacementSku?: string;
    qty?: number;
    erpWarehouse?: string;
    sourceFileName?: string;
  };
  recommendation?: InventoryCandidate;
  pickupCode?: { value: string; committed: false; label: 'Preview / not yet committed' };
  proposedPreparedRow?: {
    date: BusinessDate;
    outboundDate: null;
    action: '备货';
    sh: string;
    pickupCode: string;
    sku: string;
    model: string;
    qty: number;
    erpWarehouse: string;
    fromLocation: string;
    container?: string;
    stockCondition: InventoryCandidate['condition'];
  };
  errors: WorkOrderPreviewError[];
  warnings: string[];
}

export async function prepareWorkOrderPreview(
  dto: WorkOrderPreviewClientDto,
  port: WarehouseReadPort,
): Promise<WorkOrderPreview> {
  const parsed = parseWorkOrderText(dto.sourceText);
  const errors: WorkOrderPreviewError[] = [];
  const warnings: string[] = [];
  let businessDate: BusinessDate | undefined;
  let sh: string | undefined;
  let replacementSku: string | undefined;
  let qty: number | undefined;
  let erpWarehouse: string | undefined;
  try {
    businessDate = normalizeBusinessDate(dto.businessDate);
    sh = normalizeSH(dto.sh ?? parsed.sh);
    replacementSku = normalizeSKU(dto.replacementSku ?? parsed.replacementSku);
    qty = normalizeQty(dto.qty ?? parsed.qty);
    erpWarehouse = normalizeIdentifier(dto.erpWarehouse ?? parsed.erpWarehouse, 'erpWarehouse');
  } catch (error) {
    errors.push({ code: 'INVALID_DATA', message: String(error) });
  }

  const extracted: WorkOrderPreview['extracted'] = {};
  if (sh) extracted.sh = sh;
  if (replacementSku) extracted.replacementSku = replacementSku;
  if (qty !== undefined) extracted.qty = qty;
  if (erpWarehouse) extracted.erpWarehouse = erpWarehouse;
  if (dto.sourceFileName) extracted.sourceFileName = dto.sourceFileName;

  if (!replacementSku) {
    errors.push({ code: 'REPLACEMENT_NOT_CLEAR', message: '未识别到明确的 Replacement Unit；Faulty Unit 不会被当作 Replacement。' });
  }
  if (!businessDate || !sh || !replacementSku || !qty || !erpWarehouse || errors.length > 0) {
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, extracted, errors, warnings };
  }

  const product = await port.findProduct(replacementSku);
  if (!product) {
    errors.push({ code: 'SKU_NOT_FOUND', message: `Product Master 中不存在 SKU ${replacementSku}` });
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, errors, warnings };
  }

  const requiredCondition = preparedConditionForWarehouse(erpWarehouse);
  const candidates = await port.findAvailableInventory(replacementSku, requiredCondition, qty);
  const eligible = candidates.filter((candidate) =>
    candidate.sku === replacementSku
    && candidate.condition === requiredCondition
    && candidate.availableQty >= qty!
    && candidate.location);
  eligible.sort((left, right) =>
    left.location.localeCompare(right.location)
    || (left.container ?? '').localeCompare(right.container ?? '')
    || right.availableQty - left.availableQty);
  const recommendation = eligible[0];
  if (!recommendation) {
    const total = candidates.reduce((sum, candidate) => sum + Math.max(0, candidate.availableQty), 0);
    errors.push({
      code: total < qty ? 'INSUFFICIENT_STOCK' : 'LOCATION_UNAVAILABLE',
      message: total < qty ? `可用库存 ${total}，需求 ${qty}` : '库存记录存在，但没有可用库位。',
    });
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, errors, warnings };
  }

  const pickupCode = nextPickupCode(await port.readPickupCodes());
  if (!pickupCode) {
    errors.push({ code: 'PICKUP_CODE_UNAVAILABLE', message: '无法生成下一个 Pickup Code 预览。' });
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, recommendation, errors, warnings };
  }

  const prepared = prepareLedgerWrite({
    date: businessDate,
    action: '备货',
    shNo: sh,
    pickupCode,
    containerCode: recommendation.container,
    sku: replacementSku,
    qty,
    fromLocation: recommendation.location,
    erpWarehouse,
    stockCondition: recommendation.condition,
  });
  if (!prepared.ok) {
    errors.push({ code: 'INVALID_DATA', message: prepared.errors.map((error) => error.code).join(', ') });
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, recommendation, errors, warnings };
  }

  const row: NonNullable<WorkOrderPreview['proposedPreparedRow']> = {
    date: businessDate,
    outboundDate: null,
    action: '备货',
    sh,
    pickupCode,
    sku: replacementSku,
    model: product.model,
    qty,
    erpWarehouse,
    fromLocation: recommendation.location,
    stockCondition: recommendation.condition,
  };
  if (recommendation.container) row.container = recommendation.container;
  warnings.push('Pickup Code 仅为预览；未来确认时必须重新检查并可能重新生成。');
  return {
    mode: 'PREVIEW_ONLY',
    zeroWritesPerformed: true,
    businessDate,
    extracted,
    recommendation,
    pickupCode: { value: pickupCode, committed: false, label: 'Preview / not yet committed' },
    proposedPreparedRow: row,
    errors,
    warnings,
  };
}

export function parseWorkOrderText(sourceText: string): {
  sh?: string;
  replacementSku?: string;
  qty?: number;
  erpWarehouse?: string;
} {
  const lines = sourceText.split(/\r?\n/);
  const values = (pattern: RegExp) => lines
    .map((line) => pattern.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  const replacements = values(/^\s*Replacement(?:\s+Unit)?(?:\s+SKU)?\s*[:：-]\s*(.+?)\s*$/i);
  const sh = values(/^\s*SH(?:\s*(?:No\.?|Number))?\s*[:：-]\s*(.+?)\s*$/i)[0];
  const qtyText = values(/^\s*(?:Replacement\s+)?Qty\s*[:：-]\s*(\d+(?:\.\d+)?)\s*$/i)[0];
  const erpWarehouse = values(/^\s*ERP\s*Warehouse\s*[:：-]\s*(.+?)\s*$/i)[0];
  const result: { sh?: string; replacementSku?: string; qty?: number; erpWarehouse?: string } = {};
  if (sh) result.sh = sh;
  if (replacements.length === 1) result.replacementSku = replacements[0]!;
  if (qtyText) result.qty = Number(qtyText);
  if (erpWarehouse) result.erpWarehouse = erpWarehouse;
  return result;
}

export function nextPickupCode(codes: string[]): string | undefined {
  let max = -1;
  for (const code of codes) {
    const match = /^SYD-(\d{5})$/.exec(code.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = max + 1;
  if (next > 99_999) return undefined;
  return `SYD-${String(next).padStart(5, '0')}`;
}

/** Deterministic warehouse policy. Neither AI nor the browser selects stock condition. */
export function preparedConditionForWarehouse(
  erpWarehouse: string,
): Extract<InventoryCandidate['condition'], '新机' | '维修良品'> {
  return /(?:维修|良品|repair(?:ed)?\s*good)/i.test(erpWarehouse) ? '维修良品' : '新机';
}
