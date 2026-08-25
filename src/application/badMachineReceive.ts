import { parseBusinessDateString } from '../ledger/businessDate.js';
import { normalizeSn, resolveSnMaterial } from '../snResolver/resolver.js';
import type { SnResolveResult, VerifiedSnMapping } from '../snResolver/types.js';
import { RETURN_REPAIR_LOCATION } from './returnBatchPreview.js';

export type SnInventoryState = 'REPAIR' | 'GOOD' | 'PREPARED' | 'OUTBOUND' | 'SCRAPPED' | 'NOT_FOUND' | 'UNKNOWN';

export interface SnOperationalState {
  sn: string;
  currentState: SnInventoryState;
  previouslyOutbound: boolean;
  latestAction?: string;
  reason: string;
}

export interface MaterialOption { materialCode: string; model?: string }

export interface SnResolverContext {
  verifiedMappings: VerifiedSnMapping[];
  operationalStates: SnOperationalState[];
  materialOptions: MaterialOption[];
}

export interface SnResolverReadPort {
  readSnResolverContext(sns: readonly string[]): Promise<SnResolverContext>;
}

export interface BadMachineReceiveRow {
  index: number;
  sn: string;
  resolution: SnResolveResult;
  operationalState: SnOperationalState;
  issues: string[];
  defaultSelected: boolean;
  targetLocation: typeof RETURN_REPAIR_LOCATION;
  stockCondition: '待修';
}

export interface BadMachineReceivePreview {
  mode: 'PREVIEW_ONLY';
  zeroWritesPerformed: true;
  businessDate: string;
  targetLocation: typeof RETURN_REPAIR_LOCATION;
  rows: BadMachineReceiveRow[];
  materialOptions: MaterialOption[];
  summary: { total: number; ready: number; reviewRequired: number; duplicates: number; inventoryWarnings: number };
}

export interface ManualMaterialOverride {
  sn: string;
  autoSuggestedMaterial?: string;
  manualMaterial: string;
  operator: string;
  timestamp: string;
  reason: string;
}

export async function prepareBadMachineReceivePreview(
  input: unknown,
  businessDateInput: string,
  port: SnResolverReadPort,
): Promise<BadMachineReceivePreview> {
  const businessDate = parseBusinessDateString(businessDateInput);
  if (!businessDate) throw new TypeError('business date is required');
  const sns = parseSnBatch(input);
  const context = await port.readSnResolverContext(sns);
  const stateBySn = new Map(context.operationalStates.map((item) => [normalizeSn(item.sn), item]));
  const seen = new Set<string>();
  let duplicates = 0, inventoryWarnings = 0;
  const rows = sns.map((sn, index): BadMachineReceiveRow => {
    const normalized = normalizeSn(sn);
    const duplicate = seen.has(normalized);
    seen.add(normalized);
    const resolution = resolveSnMaterial(sn, context.verifiedMappings);
    const operationalState = stateBySn.get(normalized) ?? {
      sn: normalized, currentState: 'NOT_FOUND' as const, previouslyOutbound: false, reason: 'No ledger history found for this SN.',
    };
    const issues: string[] = [];
    if (duplicate) { issues.push('DUPLICATE_IN_BATCH'); duplicates += 1; }
    if (['REPAIR', 'GOOD', 'PREPARED'].includes(operationalState.currentState)) {
      issues.push(`ALREADY_IN_INVENTORY:${operationalState.currentState}`); inventoryWarnings += 1;
    }
    if (operationalState.previouslyOutbound) issues.push('PREVIOUSLY_OUTBOUND');
    if (resolution.confidence === 'REVIEW_REQUIRED') issues.push('MATERIAL_REVIEW_REQUIRED');
    const blocking = duplicate || issues.some((item) => item.startsWith('ALREADY_IN_INVENTORY')) || resolution.confidence === 'REVIEW_REQUIRED';
    return {
      index: index + 1, sn: normalized, resolution, operationalState, issues,
      defaultSelected: !blocking, targetLocation: RETURN_REPAIR_LOCATION, stockCondition: '待修',
    };
  });
  const ready = rows.filter((row) => row.defaultSelected).length;
  return {
    mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, businessDate, targetLocation: RETURN_REPAIR_LOCATION,
    rows, materialOptions: dedupeMaterials(context.materialOptions),
    summary: { total: rows.length, ready, reviewRequired: rows.filter((row) => row.resolution.requiresManualReview).length, duplicates, inventoryWarnings },
  };
}

function parseSnBatch(input: unknown): string[] {
  if (typeof input === 'string' && input.length > 50_000) throw new TypeError('SN 批次内容过长。');
  const values = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[\r\n,，;；]+/) : [];
  if (values.length > 500) throw new TypeError('单次最多处理 500 个 SN。');
  const sns = values.map((value) => normalizeSn(String(value ?? ''))).filter(Boolean);
  if (!sns.length) throw new TypeError('至少输入一个 SN。');
  if (sns.some((sn) => sn.length > 100)) throw new TypeError('SN 长度不能超过 100 个字符。');
  return sns;
}

function dedupeMaterials(options: readonly MaterialOption[]): MaterialOption[] {
  return [...new Map(options.filter((item) => item.materialCode).map((item) => [item.materialCode, item])).values()]
    .sort((left, right) => left.materialCode.localeCompare(right.materialCode));
}
