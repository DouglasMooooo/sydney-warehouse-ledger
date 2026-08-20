import type { BusinessDate } from '../ledger/businessDate.js';

export type OperationalTaskType = 'TODAY_PREPARED' | 'AWAITING_PICKUP' | 'TODAY_OUTBOUND' | 'TODAY_RETURN';
export type DerivedTaskState = 'PREPARED_TODAY' | 'AWAITING_PICKUP_DERIVED' | 'OUTBOUND_TODAY' | 'RETURNED_TODAY';

export interface OperationalLedgerRow {
  ledgerRow: number;
  date: string;
  outboundDate: string;
  action: string;
  sh: string;
  pickupCode: string;
  sku: string;
  model: string;
  qty?: number;
  erpWarehouse: string;
  fromLocation: string;
  toLocation: string;
  container: string;
  sn: string;
  stockCondition: string;
}

export interface OperationalTaskDetail {
  ledgerRow: number;
  sku?: string;
  model?: string;
  qty?: number;
  location?: string;
  container?: string;
  sn?: string;
}

export interface OperationalTask {
  taskType: OperationalTaskType;
  businessDate: string;
  pickupCode?: string;
  sh: string;
  action: string;
  derivedState: DerivedTaskState;
  details: OperationalTaskDetail[];
}

export interface TodayTaskSnapshot {
  businessDate: BusinessDate;
  todayPrepared: OperationalTask[];
  awaitingPickup: OperationalTask[];
  todayOutbound: OperationalTask[];
  todayReturns: OperationalTask[];
  metricGrains: {
    todayPrepared: 'SH_COUNT';
    awaitingPickup: 'TASK_COUNT_PICKUP_FALLBACK_SH';
    todayOutbound: 'TASK_COUNT_PICKUP_FALLBACK_SH';
    todayReturns: 'QTY';
  };
  notes: string[];
}

export function deriveTodayTasks(rows: OperationalLedgerRow[], asOf: BusinessDate): TodayTaskSnapshot {
  return {
    businessDate: asOf,
    todayPrepared: groupTasks(
      rows.filter((row) => row.action === '备货' && row.date === asOf),
      'TODAY_PREPARED', 'PREPARED_TODAY', 'sh',
    ),
    awaitingPickup: deriveAwaitingPickup(rows),
    todayOutbound: groupTasks(
      rows.filter((row) => row.action === '出库' && row.outboundDate === asOf),
      'TODAY_OUTBOUND', 'OUTBOUND_TODAY', 'pickup-fallback-sh',
    ),
    todayReturns: rows
      .filter((row) => row.action === '退回维修' && row.date === asOf)
      .map((row) => taskFromRows([row], 'TODAY_RETURN', 'RETURNED_TODAY')),
    metricGrains: {
      todayPrepared: 'SH_COUNT',
      awaitingPickup: 'TASK_COUNT_PICKUP_FALLBACK_SH',
      todayOutbound: 'TASK_COUNT_PICKUP_FALLBACK_SH',
      todayReturns: 'QTY',
    },
    notes: [
      '待备货没有可靠的 pre-Prepared 来源，因此不提供该队列。',
      '待取货优先按 Pickup Code、缺失时按 SH 派生；历史缺 Pickup 且重复 SH 时需要人工复核。',
    ],
  };
}

function deriveAwaitingPickup(rows: OperationalLedgerRow[]): OperationalTask[] {
  const aliases = new Map<string, string>();
  const groups = new Map<string, { prepared: OperationalLedgerRow[]; balances: Map<string, number> }>();
  for (const row of rows) {
    const pickupAlias = row.pickupCode ? `pickup:${row.pickupCode}` : undefined;
    const shAlias = row.sh ? `sh:${row.sh}` : undefined;
    if (row.action === '备货') {
      if (row.outboundDate || !row.sku || row.qty === undefined || row.qty <= 0) continue;
      const key = pickupAlias ?? shAlias;
      if (!key) continue;
      if (pickupAlias) aliases.set(pickupAlias, key);
      if (shAlias) aliases.set(shAlias, key);
      const group = groups.get(key) ?? { prepared: [], balances: new Map<string, number>() };
      group.prepared.push(row);
      group.balances.set(row.sku, (group.balances.get(row.sku) ?? 0) + row.qty);
      groups.set(key, group);
      continue;
    }
    if (row.action !== '出库' || !row.sku || row.qty === undefined || row.qty <= 0) continue;
    const key = (pickupAlias && aliases.get(pickupAlias)) ?? (shAlias && aliases.get(shAlias));
    if (!key) continue;
    const group = groups.get(key);
    if (!group) continue;
    group.balances.set(row.sku, Math.max(0, (group.balances.get(row.sku) ?? 0) - row.qty));
  }
  return [...groups.values()]
    .filter((group) => [...group.balances.values()].some((qty) => qty > 0))
    .map((group) => {
      const remainingBySku = new Map(group.balances);
      const remaining: OperationalLedgerRow[] = [];
      for (const row of group.prepared) {
        const available = remainingBySku.get(row.sku) ?? 0;
        const qty = Math.min(row.qty ?? 0, available);
        remainingBySku.set(row.sku, Math.max(0, available - qty));
        if (qty > 0) remaining.push({ ...row, qty });
      }
      return taskFromRows(remaining, 'AWAITING_PICKUP', 'AWAITING_PICKUP_DERIVED');
    });
}

function groupTasks(
  rows: OperationalLedgerRow[],
  taskType: OperationalTaskType,
  state: DerivedTaskState,
  grain: 'sh' | 'pickup-fallback-sh',
): OperationalTask[] {
  const groups = new Map<string, OperationalLedgerRow[]>();
  for (const row of rows) {
    const key = grain === 'sh' ? row.sh : (row.pickupCode || row.sh);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => taskFromRows(group, taskType, state));
}

function taskFromRows(
  rows: OperationalLedgerRow[],
  taskType: OperationalTaskType,
  state: DerivedTaskState,
): OperationalTask {
  const first = rows[0]!;
  const task: OperationalTask = {
    taskType,
    businessDate: taskType === 'TODAY_OUTBOUND' ? first.outboundDate : first.date,
    sh: first.sh,
    action: first.action,
    derivedState: state,
    details: rows.map((row) => {
      const detail: OperationalTaskDetail = { ledgerRow: row.ledgerRow };
      if (row.sku) detail.sku = row.sku;
      if (row.model) detail.model = row.model;
      if (row.qty !== undefined) detail.qty = row.qty;
      const location = row.action === '退回维修' ? row.toLocation : row.fromLocation;
      if (location) detail.location = location;
      if (row.container) detail.container = row.container;
      if (row.sn) detail.sn = row.sn;
      return detail;
    }),
  };
  if (first.pickupCode) task.pickupCode = first.pickupCode;
  return task;
}
