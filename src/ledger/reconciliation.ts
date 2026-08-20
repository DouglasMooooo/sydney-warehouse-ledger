import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { cellsByAddress, readRange } from '../feishu/read.js';
import type { FeishuCell } from '../feishu/types.js';

export interface SnapshotConfig {
  spreadsheetUrl: string;
  mainSheetId: string;
  weeklySheetId: string;
  monthlySheetId: string;
  currentInventorySheetId: string;
}

export interface Phase1Snapshot {
  capturedAt: string;
  main: Record<string, FeishuCell>;
  weekly: Record<string, unknown>;
  monthly: Record<string, unknown>;
  currentInventory: Record<string, number>;
}

export const WEEKLY_KPIS = {
  '售后回收入库': 'B5', '维修完成': 'B6', '维修报废': 'B7', '维修良品发货': 'B8',
  '新机发货': 'E6', '新机库存': 'E7', '备货单据': 'E8', '出货单据': 'E9', '旧机未返': 'E10',
} as const;

export const MONTHLY_KPIS = {
  '售后回收入库': 'B12', '维修完成': 'C12', '维修良品发货': 'E12', '新机发货': 'I12',
  '新机库存': 'M12', '新增备货SH': 'P19', '出货SH': 'P20', '旧机未返SH': 'P21',
} as const;

export function captureSnapshot(config: SnapshotConfig): Phase1Snapshot {
  const main = cellsByAddress(readRange({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.mainSheetId,
    range: 'A1648:AC1660', include: ['formula'],
  }));
  const weekly = cellsByAddress(readRange({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.weeklySheetId,
    range: 'A1:F14', include: ['formula'],
  }));
  const monthly = cellsByAddress(readRange({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.monthlySheetId,
    range: 'A1:R24', include: ['formula'],
  }));
  const inventory = cellsByAddress(readRange({
    spreadsheetUrl: config.spreadsheetUrl, sheetId: config.currentInventorySheetId,
    range: 'A1:M138', include: ['formula'],
  }));
  return {
    capturedAt: new Date().toISOString(),
    main: Object.fromEntries(main),
    weekly: valuesForLabels(weekly, WEEKLY_KPIS),
    monthly: valuesForLabels(monthly, MONTHLY_KPIS),
    currentInventory: inventoryTotals(inventory),
  };
}

function valuesForLabels(cells: Map<string, FeishuCell>, mapping: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(mapping).map(([label, address]) => [label, cells.get(address)?.value ?? null]));
}

export function inventoryTotals(cells: Map<string, FeishuCell>): Record<string, number> {
  const totals: Record<string, number> = { '总数量': 0 };
  for (let row = 2; row <= 138; row += 1) {
    const qty = cells.get(`H${row}`)?.value;
    if (typeof qty !== 'number' || !Number.isFinite(qty)) continue;
    const condition = String(cells.get(`L${row}`)?.value ?? '未分类');
    totals['总数量'] = (totals['总数量'] ?? 0) + qty;
    totals[condition] = (totals[condition] ?? 0) + qty;
  }
  return Object.fromEntries(Object.entries(totals).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')));
}

export function saveSnapshot(path: string, snapshot: Phase1Snapshot): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

export function loadSnapshot(path: string): Phase1Snapshot {
  return JSON.parse(readFileSync(path, 'utf8')) as Phase1Snapshot;
}

export interface ReconciliationItem {
  group: 'Current inventory' | 'Weekly' | 'Monthly';
  name: string;
  before: unknown;
  after: unknown;
  status: 'PASS' | 'FAIL';
}

export function reconcileSnapshots(before: Phase1Snapshot, after: Phase1Snapshot): ReconciliationItem[] {
  const result: ReconciliationItem[] = [];
  const compare = (group: ReconciliationItem['group'], first: Record<string, unknown>, second: Record<string, unknown>) => {
    for (const name of [...new Set([...Object.keys(first), ...Object.keys(second)])].sort()) {
      const beforeValue = first[name] ?? null;
      const afterValue = second[name] ?? null;
      result.push({ group, name, before: beforeValue, after: afterValue, status: deepEqual(beforeValue, afterValue) ? 'PASS' : 'FAIL' });
    }
  };
  compare('Current inventory', before.currentInventory, after.currentInventory);
  compare('Weekly', before.weekly, after.weekly);
  compare('Monthly', before.monthly, after.monthly);
  return result;
}

const deepEqual = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);

export function reconciliationMarkdown(items: ReconciliationItem[], capturedAt: string): string {
  const overall = items.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
  const lines = [
    '# Phase 1 Reconciliation', '', `Overall: **${overall}**`, '', `After snapshot: ${capturedAt}`, '',
    '| Group | KPI | Before | After | Status |', '|---|---|---:|---:|---|',
    ...items.map((item) => `| ${item.group} | ${item.name} | ${safe(item.before)} | ${safe(item.after)} | ${item.status} |`),
    '', 'Only aggregate/KPI values are shown. No operational records or identifiers are included.', '',
  ];
  return lines.join('\n');
}

function safe(value: unknown): string {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function businessCellsUnchanged(before: Phase1Snapshot, after: Phase1Snapshot): boolean {
  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'J', 'K', 'L', 'M', 'N', 'P', 'V'];
  for (let row = 1648; row <= 1660; row += 1) {
    for (const column of columns) {
      if (!deepEqual(before.main[`${column}${row}`], after.main[`${column}${row}`])) return false;
    }
  }
  return true;
}
