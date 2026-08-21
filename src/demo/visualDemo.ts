import type { DashboardSnapshot } from '../application/contracts.js';
import { formatLocationSummary, type LocationSummary } from '../application/locationSummary.js';
import type { OperationalException } from '../application/exceptionService.js';
import type { TodayTaskSnapshot } from '../application/todayTasks.js';
import type { BusinessDate } from '../ledger/businessDate.js';

const SENSITIVE_KEYS = [
  'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN',
  'FEISHU_MAIN_SHEET_ID', 'FEISHU_CURRENT_INVENTORY_SHEET_ID',
  'WAREHOUSE_SESSION_SECRET', 'WAREHOUSE_OPERATOR_USERS', 'WAREHOUSE_READ_ONLY_USERS',
  'GOOGLE_SPREADSHEET_ID',
] as const;

/** Public visual preview: sample data only, never combined with live credentials. */
export function isVisualDemoMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.WAREHOUSE_VISUAL_DEMO === 'true'
    && env.READ_ONLY_RELEASE === 'true'
    && SENSITIVE_KEYS.every((key) => !env[key]?.trim());
}

/** Anonymous, zero-write UAT over one explicitly configured public Google Sheet. */
export function isGoogleSheetsUatMode(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.WAREHOUSE_GOOGLE_UAT === 'true'
    && env.READ_ONLY_RELEASE === 'true'
    && env.WAREHOUSE_READ_ADAPTER === 'google-sheets-gviz'
    && Boolean(env.GOOGLE_SPREADSHEET_ID?.trim())
    && Boolean(env.APP_VERSION?.trim())
    && [
      'FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN',
      'WAREHOUSE_SESSION_SECRET', 'WAREHOUSE_OPERATOR_USERS', 'WAREHOUSE_READ_ONLY_USERS',
    ].every((key) => !env[key]?.trim());
}

export function visualDemoDashboard(asOf: BusinessDate): DashboardSnapshot {
  return {
    businessDate: asOf,
    metrics: {
      todayPreparedWorkOrders: 4, awaitingPreparation: null, awaitingPickup: 3,
      shippedToday: 6, returnedToday: 2, exceptionCount: 2,
    },
    inventory: { newUnits: 38, repairedGood: 17, pendingRepair: 6, repairInventory: 23, scrapped: 2 },
    inventoryByModel: [
      { model: 'DEMO-MODEL-A', condition: '新机', availableQty: 18 },
      { model: 'DEMO-MODEL-B', condition: '维修良品', availableQty: 12 },
      { model: 'DEMO-MODEL-C', condition: '物料', availableQty: 9 },
    ],
    inventoryByLocation: [
      { location: 'R1-01-L', availableQty: 16 },
      { location: 'R1-02-M', availableQty: 12 },
      { location: 'R2-01-R', availableQty: 9 },
    ],
    inventoryByCondition: [
      { condition: '新机', availableQty: 38 }, { condition: '维修良品', availableQty: 17 },
      { condition: '待修', availableQty: 6 }, { condition: '报废', availableQty: 2 },
      { condition: '物料', availableQty: 9 },
    ],
    activityBreakdowns: { thisWeekShippedQty: 21, thisWeekReturnedQty: 4, thisMonthShippedQty: 67 },
    metricGrains: {
      todayPreparedWorkOrders: 'SH_COUNT', awaitingPreparation: 'UNAVAILABLE', awaitingPickup: 'TASK_COUNT',
      shippedToday: 'TASK_COUNT', returnedToday: 'QTY', exceptionCount: 'ISSUE_COUNT',
    },
    recentPrepared: [
      { businessDate: asOf, pickupCode: 'DEMO-PICK-001', sh: 'DEMO-SH-001', sku: 'DEMO-SKU-A', qty: 2, location: 'R1-01-L' },
      { businessDate: asOf, pickupCode: 'DEMO-PICK-002', sh: 'DEMO-SH-002', sku: 'DEMO-SKU-B', qty: 1, location: 'R1-02-M' },
    ],
    recentReturns: [
      { businessDate: asOf, sku: 'DEMO-SKU-C', qty: 1, location: 'REPAIR-DEMO' },
    ],
    exceptions: [{ code: 'INVALID_LOCATION', count: 1 }, { code: 'MISSING_INVENTORY_QTY', count: 1 }],
    notes: [
      '视觉演示使用内置脱敏样例，不代表真实库存或真实业务活动。',
      '未连接飞书、Google Sheet 或任何第二库存数据库。',
    ],
  };
}

export function visualDemoTasks(asOf: BusinessDate): TodayTaskSnapshot {
  const base = {
    businessDate: asOf,
    action: '备货',
    details: [{ ledgerRow: 1, sku: 'DEMO-SKU-A', model: 'DEMO-MODEL-A', qty: 2, location: 'R1-01-L' }],
  };
  return {
    businessDate: asOf,
    todayPrepared: [{ ...base, taskType: 'TODAY_PREPARED', derivedState: 'PREPARED_TODAY', pickupCode: 'DEMO-PICK-001', sh: 'DEMO-SH-001' }],
    awaitingPickup: [{ ...base, taskType: 'AWAITING_PICKUP', derivedState: 'AWAITING_PICKUP_DERIVED', pickupCode: 'DEMO-PICK-002', sh: 'DEMO-SH-002' }],
    todayOutbound: [{ ...base, taskType: 'TODAY_OUTBOUND', derivedState: 'OUTBOUND_TODAY', action: '出库', pickupCode: 'DEMO-PICK-003', sh: 'DEMO-SH-003' }],
    todayReturns: [{ ...base, taskType: 'TODAY_RETURN', derivedState: 'RETURNED_TODAY', action: '退回维修', sh: 'DEMO-SH-004' }],
    metricGrains: {
      todayPrepared: 'SH_COUNT', awaitingPickup: 'TASK_COUNT_PICKUP_FALLBACK_SH',
      todayOutbound: 'TASK_COUNT_PICKUP_FALLBACK_SH', todayReturns: 'QTY',
    },
    notes: ['视觉演示任务为脱敏样例，不来自飞书台账。'],
  };
}

export function visualDemoLocations(): { locations: Array<LocationSummary & { displayText: string }>; issues: [] } {
  const summaries: LocationSummary[] = [
    { location: 'R1-01-L', totalQty: 10, skuLines: [{ sku: 'DEMO-SKU-A', qty: 10 }], containers: ['DEMO-C01'] },
    { location: 'R1-02-M', totalQty: 6, skuLines: [{ sku: 'DEMO-SKU-B', qty: 6 }], containers: [] },
    { location: 'R2-01-R', totalQty: 9, skuLines: [{ sku: 'DEMO-SKU-C', qty: 9 }], containers: ['DEMO-C02'] },
    { location: 'SERVICE-DEMO', totalQty: 2, skuLines: [{ sku: 'DEMO-SKU-D', qty: 2 }], containers: [] },
  ];
  return { locations: summaries.map((item) => ({ ...item, displayText: formatLocationSummary(item.location, item) })), issues: [] };
}

export function visualDemoExceptions(): { exceptions: OperationalException[]; supportedCodes: readonly string[] } {
  return {
    exceptions: [
      { severity: 'WARNING', code: 'INVALID_LOCATION', ledgerRow: 101, sku: 'DEMO-SKU-X', description: '演示：库位不在维护清单中。', suggestedAction: '核对库位维护表。' },
      { severity: 'ERROR', code: 'MISSING_INVENTORY_QTY', ledgerRow: 102, sku: 'DEMO-SKU-Y', description: '演示：库存数量缺失。', suggestedAction: '复核来源行，不猜测数量。' },
    ],
    supportedCodes: ['INVALID_LOCATION', 'MISSING_INVENTORY_QTY'],
  };
}
