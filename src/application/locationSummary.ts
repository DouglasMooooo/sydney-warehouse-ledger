import { parseSourceNumber } from '../feishu/sourceValues.js';

export interface LocationInventoryRecord {
  location: string;
  sku: string;
  qty: unknown;
  container?: string;
}

export interface LocationSummary {
  location: string;
  totalQty: number;
  skuLines: Array<{ sku: string; qty: number }>;
  containers: string[];
}

export interface LocationSummaryIssue {
  code: 'MISSING_INVENTORY_QTY' | 'INVALID_INVENTORY_QTY';
  sourceRow?: number;
  location?: string;
}

export interface LocationSummaryResult {
  summaries: LocationSummary[];
  issues: LocationSummaryIssue[];
}

/** Deterministic, read-only aggregation over current-inventory records only. */
export function summarizeLocations(
  records: Array<LocationInventoryRecord & { sourceRow?: number }>,
): LocationSummaryResult {
  const byLocation = new Map<string, { skuQty: Map<string, number>; containers: Set<string> }>();
  const issues: LocationSummaryIssue[] = [];
  for (const record of records) {
    const location = record.location.trim();
    const sku = record.sku.trim();
    const parsed = parseSourceNumber(record.qty);
    if (parsed.kind !== 'valid') {
      const item: LocationSummaryIssue = {
        code: parsed.kind === 'missing' ? 'MISSING_INVENTORY_QTY' : 'INVALID_INVENTORY_QTY',
      };
      if (record.sourceRow !== undefined) item.sourceRow = record.sourceRow;
      if (location) item.location = location;
      issues.push(item);
      continue;
    }
    if (parsed.value <= 0 || !location || !sku) continue;
    const group = byLocation.get(location) ?? { skuQty: new Map<string, number>(), containers: new Set<string>() };
    group.skuQty.set(sku, (group.skuQty.get(sku) ?? 0) + parsed.value);
    const container = record.container?.trim();
    if (container) group.containers.add(container);
    byLocation.set(location, group);
  }
  const summaries = [...byLocation.entries()].map(([location, group]): LocationSummary => {
    const skuLines = [...group.skuQty.entries()]
      .map(([sku, qty]) => ({ sku, qty }))
      .sort((left, right) => left.sku.localeCompare(right.sku));
    return {
      location,
      totalQty: skuLines.reduce((sum, line) => sum + line.qty, 0),
      skuLines,
      containers: [...group.containers].sort((left, right) => left.localeCompare(right)),
    };
  }).sort((left, right) => left.location.localeCompare(right.location));
  return { summaries, issues };
}

export function formatLocationSummary(location: string, summary?: LocationSummary): string {
  if (!summary || summary.totalQty <= 0) return `${location}\n空`;
  const lines = [location, ...summary.skuLines.map((line) => `${line.sku} × ${formatQty(line.qty)}`)];
  if (summary.containers.length > 0) lines.push(`容器: ${summary.containers.join(', ')}`);
  lines.push(`总数: ${formatQty(summary.totalQty)}`);
  return lines.join('\n');
}

function formatQty(qty: number): string {
  return Number.isInteger(qty) ? String(qty) : String(Number(qty.toFixed(6)));
}
