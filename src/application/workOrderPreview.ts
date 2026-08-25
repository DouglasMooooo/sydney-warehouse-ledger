import { parseBusinessDateString, type BusinessDate } from '../ledger/businessDate.js';
import { normalizeIdentifier, normalizeQty, normalizeSH, normalizeSKU } from '../ledger/normalize.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import { parsePlainTextWorkOrder } from '../workOrders/textParser.js';
import type { InventoryCandidate, WarehouseReadPort } from './contracts.js';
import type { WorkOrderPreviewClientDto } from './clientDtos.js';
import { ErpWarehouseUnsupportedError, preparedConditionForWarehouse } from './erpWarehouseRules.js';

export type WorkOrderPreviewErrorCode =
  | 'REPLACEMENT_NOT_CLEAR'
  | 'SKU_NOT_FOUND'
  | 'INSUFFICIENT_STOCK'
  | 'LOCATION_UNAVAILABLE'
  | 'INVALID_DATA'
  | 'PICKUP_CODE_UNAVAILABLE'
  | 'ERP_WAREHOUSE_UNSUPPORTED';

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
  const parserSource = dto.sourceFileName
    ? { sourceText: dto.sourceText, sourceFileName: dto.sourceFileName }
    : { sourceText: dto.sourceText };
  const parsed = parsePlainTextWorkOrder(parserSource);
  const errors: WorkOrderPreviewError[] = [];
  const warnings: string[] = [...parsed.warnings];
  let businessDate: BusinessDate | undefined;
  let sh: string | undefined;
  let replacementSku: string | undefined;
  let qty: number | undefined;
  let erpWarehouse: string | undefined;
  try {
    businessDate = parseBusinessDateString(dto.businessDate);
    sh = normalizeSH(parsed.shNo);
    const replacement = parsed.replacementLines.length === 1 ? parsed.replacementLines[0] : undefined;
    replacementSku = normalizeSKU(replacement?.sku);
    qty = normalizeQty(replacement?.qty);
    erpWarehouse = normalizeIdentifier(replacement?.erpWarehouse, 'erpWarehouse');
  } catch (error) {
    errors.push({ code: 'INVALID_DATA', message: String(error) });
  }

  const extracted: WorkOrderPreview['extracted'] = {};
  if (sh) extracted.sh = sh;
  if (replacementSku) extracted.replacementSku = replacementSku;
  if (qty !== undefined) extracted.qty = qty;
  if (erpWarehouse) extracted.erpWarehouse = erpWarehouse;
  if (parsed.sourceFileName) extracted.sourceFileName = parsed.sourceFileName;

  if (parsed.confidence !== 'high' || parsed.replacementLines.length !== 1 || !replacementSku) {
    errors.push({ code: 'REPLACEMENT_NOT_CLEAR', message: 'Replacement Unit information 未能明确解析为单一出库行；Faulty Unit 永远不会被用作 Replacement。' });
  }
  if (!businessDate || !sh || !replacementSku || !qty || !erpWarehouse || errors.length > 0) {
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, extracted, errors, warnings };
  }

  const product = await port.findProduct(replacementSku);
  if (!product) {
    errors.push({ code: 'SKU_NOT_FOUND', message: `Product Master 中不存在 SKU ${replacementSku}` });
    return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, errors, warnings };
  }

  let requiredCondition: ReturnType<typeof preparedConditionForWarehouse>;
  try {
    requiredCondition = preparedConditionForWarehouse(erpWarehouse);
  } catch (error) {
    if (error instanceof ErpWarehouseUnsupportedError) {
      errors.push({ code: error.code, message: `不支持的 ERP Warehouse：${erpWarehouse}` });
      return { mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, extracted, errors, warnings };
    }
    throw error;
  }
  const candidates = await port.findAvailableInventory(replacementSku, requiredCondition, qty);
  const eligible = candidates.filter((candidate) =>
    candidate.sku === replacementSku
    && candidate.condition === requiredCondition
    && candidate.availableQty >= qty!
    && candidate.location);
  eligible.sort((left, right) =>
    Number(right.location === 'FLEX-01') - Number(left.location === 'FLEX-01')
    || right.availableQty - left.availableQty
    || left.location.localeCompare(right.location)
    || (left.container ?? '').localeCompare(right.container ?? ''));
  const recommendation = eligible[0];
  if (!recommendation) {
    const located = candidates.filter((candidate) => candidate.location && candidate.availableQty > 0);
    const total = located.reduce((sum, candidate) => sum + candidate.availableQty, 0);
    const largest = located.reduce((max, candidate) => Math.max(max, candidate.availableQty), 0);
    const sufficientWithoutLocation = candidates.some((candidate) => !candidate.location && candidate.availableQty >= qty);
    errors.push({
      code: sufficientWithoutLocation ? 'LOCATION_UNAVAILABLE' : 'INSUFFICIENT_STOCK',
      message: sufficientWithoutLocation
        ? '库存记录存在，但没有可用库位。'
        : `没有单一库位可满足需求 ${qty}；最大单库位库存 ${largest}，合计 ${total}。本轮不拆分库位。`,
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
    stockCondition: requiredCondition,
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
    model: product.displayName ?? product.model ?? replacementSku,
    qty,
    erpWarehouse,
    fromLocation: recommendation.location,
    stockCondition: requiredCondition,
  };
  if (recommendation.container) row.container = recommendation.container;
  warnings.push('Pickup Code 仅为预览，未被预留，确认前可能变化。');
  warnings.push('未来写入必须在事务写入前重新读取全部 Pickup Code，并立即复核全局唯一性。');
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
