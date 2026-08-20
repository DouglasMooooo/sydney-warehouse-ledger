import { STOCK_CONDITIONS, type StockCondition } from '../config/controlledValues.js';
import type { BusinessDate } from '../ledger/businessDate.js';
import type {
  DashboardSnapshot, InventoryCandidate, ProductRecord, WarehouseReadPort,
} from '../application/contracts.js';
import { deriveTodayTasks, type OperationalLedgerRow, type TodayTaskSnapshot } from '../application/todayTasks.js';
import { formatLocationSummary, summarizeLocations, type LocationInventoryRecord, type LocationSummary } from '../application/locationSummary.js';
import {
  deriveLedgerExceptions, detectContainerMismatches, inventoryIssuesToOperationalExceptions,
  OPERATIONAL_EXCEPTION_CODES, type OperationalException,
} from '../application/exceptionService.js';
import { requiredEnv } from './client.js';
import { readTypedTable } from './read.js';
import type { TypedSheetData } from './types.js';
import { parseSourceNumber } from './sourceValues.js';

const MAIN = {
  date: 0, outboundDate: 1, action: 2, sh: 3, pickup: 4, container: 5,
  sku: 6, model: 7, sn: 9, qty: 10, fromLocation: 11, toLocation: 12,
  erpWarehouse: 13, stockCondition: 15,
} as const;

export interface FeishuWarehouseReadConfig {
  spreadsheetUrl: string;
  mainSheetId: string;
  currentInventorySheetId: string;
}

export class FeishuWarehouseReadAdapter implements WarehouseReadPort {
  constructor(private readonly config: FeishuWarehouseReadConfig) {}

  async readDashboardSource(asOf: BusinessDate): Promise<DashboardSnapshot> {
    const [main, inventory] = await Promise.all([this.readMain(), this.readInventory()]);
    const mainRows = main.data.slice(1).filter((row) => text(row[MAIN.action]));
    const inventoryModel = parseInventoryRecords(inventory);
    const inventoryRows = inventoryModel.records;
    const prepared = mainRows.filter((row) => text(row[MAIN.action]) === '备货');
    const returns = mainRows.filter((row) => text(row[MAIN.action]) === '退回维修');
    const shipped = mainRows.filter((row) => text(row[MAIN.action]) === '出库');
    const operationalRows = mainRows.map((row, index) => toOperationalLedgerRow(row, index + 2));
    const tasks = deriveTodayTasks(operationalRows, asOf);
    const rawInventory = rawInventoryRecords(inventory);
    const inventorySummary = summarizeLocations(rawInventory);
    const validLocations = this.readValidLocations();
    const dashboardExceptions = [
      ...deriveLedgerExceptions(operationalRows, validLocations),
      ...inventoryIssuesToOperationalExceptions(inventorySummary.issues),
      ...detectContainerMismatches(rawInventory),
    ];
    const exceptionCounts = new Map<string, number>();
    for (const item of dashboardExceptions) exceptionCounts.set(item.code, (exceptionCounts.get(item.code) ?? 0) + 1);
    const byModel = new Map<string, number>();
    const byLocation = new Map<string, number>();
    for (const item of inventoryRows) {
      const key = `${item.model}\u0000${item.condition}`;
      byModel.set(key, (byModel.get(key) ?? 0) + item.availableQty);
      byLocation.set(item.location, (byLocation.get(item.location) ?? 0) + item.availableQty);
    }
    const conditionTotal = (condition: StockCondition) => inventoryRows
      .filter((item) => item.condition === condition)
      .reduce((sum, item) => sum + item.availableQty, 0);
    const newUnits = conditionTotal('新机');
    const repairedGood = conditionTotal('维修良品');
    const pendingRepair = conditionTotal('待修');
    return {
      businessDate: asOf,
      metrics: {
        todayPreparedWorkOrders: new Set(prepared.filter((row) => businessDate(row[MAIN.date]) === asOf).map((row) => text(row[MAIN.sh])).filter(Boolean)).size,
        awaitingPreparation: null,
        awaitingPickup: tasks.awaitingPickup.length,
        shippedToday: tasks.todayOutbound.length,
        returnedToday: tasks.todayReturns.reduce((sum, task) => sum + task.details.reduce((qty, detail) => qty + (detail.qty ?? 0), 0), 0),
        exceptionCount: [...exceptionCounts.values()].reduce((sum, count) => sum + count, 0),
      },
      inventory: {
        newUnits,
        repairedGood,
        pendingRepair,
        repairInventory: repairedGood + pendingRepair,
        scrapped: conditionTotal('报废'),
      },
      inventoryByModel: [...byModel.entries()]
        .map(([key, availableQty]) => {
          const [model = '', condition = ''] = key.split('\u0000');
          return { model, condition, availableQty };
        })
        .sort((left, right) => right.availableQty - left.availableQty || left.model.localeCompare(right.model))
        .slice(0, 12),
      inventoryByLocation: [...byLocation.entries()]
        .map(([location, availableQty]) => ({ location, availableQty }))
        .sort((left, right) => right.availableQty - left.availableQty || left.location.localeCompare(right.location)),
      inventoryByCondition: STOCK_CONDITIONS.map((condition) => ({ condition, availableQty: conditionTotal(condition) })),
      activityBreakdowns: {
        thisWeekShippedQty: qtyForPeriod(shipped, MAIN.outboundDate, asOf, 'week'),
        thisWeekReturnedQty: qtyForPeriod(returns, MAIN.date, asOf, 'week'),
        thisMonthShippedQty: qtyForPeriod(shipped, MAIN.outboundDate, asOf, 'month'),
      },
      metricGrains: {
        todayPreparedWorkOrders: 'SH_COUNT', awaitingPreparation: 'UNAVAILABLE',
        awaitingPickup: 'TASK_COUNT', shippedToday: 'TASK_COUNT', returnedToday: 'QTY',
        exceptionCount: 'ISSUE_COUNT', newUnits: 'QTY', repairedGood: 'QTY',
        pendingRepair: 'QTY', repairInventory: 'QTY', scrapped: 'QTY',
        thisWeekShipped: 'QTY', thisWeekReturned: 'QTY', thisMonthShipped: 'QTY',
      },
      recentPrepared: prepared.slice(-6).reverse().map((row) => ({
        businessDate: businessDate(row[MAIN.date]),
        sh: text(row[MAIN.sh]),
        sku: text(row[MAIN.sku]),
        qty: sourceNumberOrNull(row[MAIN.qty]),
        location: text(row[MAIN.fromLocation]),
        pickupCode: text(row[MAIN.pickup]),
      })),
      recentReturns: returns.slice(-6).reverse().map((row) => ({
        businessDate: businessDate(row[MAIN.date]),
        sku: text(row[MAIN.sku]),
        qty: sourceNumberOrNull(row[MAIN.qty]),
        location: text(row[MAIN.toLocation]),
      })),
      exceptions: [...exceptionCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
      notes: [
        '待备货在现有流水中没有独立的预录状态，因此显示为不可用；未新增人工 Status 列。',
        '待取货按 Pickup Code（缺失时按 SH）计为任务；同一任务的多 SKU 行只计一次，后续匹配出库会抵消对应 SKU 数量。',
        '待取货是派生指标；若历史出库缺少 Pickup Code 且 SH 被重复使用，SH 回退匹配需要人工复核。',
        '维修库存按当前库存中的“维修良品 + 待修”实时派生。',
      ],
    };
  }

  async findProduct(sku: string): Promise<ProductRecord | undefined> {
    const table = readTypedTable({
      spreadsheetUrl: this.config.spreadsheetUrl,
      sheetName: '产品库存维护',
    });
    const skuIndex = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
    const modelIndex = columnIndex(table, ['Model', '机型', '型号']);
    const row = table.data.find((item) => text(item[skuIndex]) === sku);
    return row ? { sku, model: text(row[modelIndex]) } : undefined;
  }

  async findAvailableInventory(
    sku: string,
    stockCondition: InventoryCandidate['condition'],
    qty: number,
  ): Promise<InventoryCandidate[]> {
    void qty;
    return parseInventoryRecords(this.readInventory()).records.filter((item) =>
      item.sku === sku && item.condition === stockCondition && item.availableQty > 0);
  }

  async readPickupCodes(): Promise<string[]> {
    return this.readMain().data.slice(1).map((row) => text(row[MAIN.pickup])).filter(Boolean);
  }

  readTodayTasks(asOf: BusinessDate): TodayTaskSnapshot {
    const rows = this.readMain().data.slice(1)
      .filter((row) => text(row[MAIN.action]))
      .map((row, index) => toOperationalLedgerRow(row, index + 2));
    return deriveTodayTasks(rows, asOf);
  }

  readLocationSummaries(): { locations: Array<LocationSummary & { displayText: string }>; issues: ReturnType<typeof summarizeLocations>['issues'] } {
    const result = summarizeLocations(rawInventoryRecords(this.readInventory()));
    const byLocation = new Map(result.summaries.map((summary) => [summary.location, summary]));
    const locations = [...this.readValidLocations()].sort((left, right) => left.localeCompare(right));
    return {
      locations: locations.map((location) => {
        const summary = byLocation.get(location) ?? { location, totalQty: 0, skuLines: [], containers: [] };
        return { ...summary, displayText: formatLocationSummary(location, summary) };
      }),
      issues: result.issues,
    };
  }

  readOperationalExceptions(): { exceptions: OperationalException[]; supportedCodes: readonly string[] } {
    const main = this.readMain();
    const inventory = rawInventoryRecords(this.readInventory());
    const rows = main.data.slice(1).filter((row) => text(row[MAIN.action]))
      .map((row, index) => toOperationalLedgerRow(row, index + 2));
    const summary = summarizeLocations(inventory);
    const validLocations = this.readValidLocations();
    const exceptions = [
      ...deriveLedgerExceptions(rows, validLocations),
      ...inventoryIssuesToOperationalExceptions(summary.issues),
      ...detectContainerMismatches(inventory),
    ];
    return { exceptions, supportedCodes: OPERATIONAL_EXCEPTION_CODES };
  }

  private readMain(): TypedSheetData {
    return readTypedTable({
      spreadsheetUrl: this.config.spreadsheetUrl,
      sheetId: this.config.mainSheetId,
      noHeader: true,
    });
  }

  private readInventory(): TypedSheetData {
    return readTypedTable({
      spreadsheetUrl: this.config.spreadsheetUrl,
      sheetId: this.config.currentInventorySheetId,
    });
  }

  private readValidLocations(): Set<string> {
    const table = readTypedTable({ spreadsheetUrl: this.config.spreadsheetUrl, sheetName: '库位维护' });
    const location = columnIndex(table, ['库位编码（R-排-列-L/M/R）', '库位编码', 'Location']);
    return new Set(table.data.map((row) => text(row[location])).filter(Boolean));
  }
}

export function warehouseReadAdapterFromEnv(): FeishuWarehouseReadAdapter {
  return new FeishuWarehouseReadAdapter({
    spreadsheetUrl: requiredEnv('FEISHU_SPREADSHEET_URL'),
    mainSheetId: requiredEnv('FEISHU_MAIN_SHEET_ID'),
    currentInventorySheetId: requiredEnv('FEISHU_CURRENT_INVENTORY_SHEET_ID'),
  });
}

export function parseInventoryRecords(table: TypedSheetData): { records: InventoryCandidate[]; missingQty: number; invalidQty: number } {
  const sku = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
  const model = columnIndex(table, ['Model', '机型', '型号']);
  const location = columnIndex(table, ['Location', '库位', '当前库位']);
  const container = optionalColumnIndex(table, ['Container', '容器', '容器码']);
  const available = columnIndex(table, ['Available Qty', '可用数量', '可用库存', '可用Qty', '当前数量']);
  const condition = columnIndex(table, ['Stock Condition', '库存属性', '属性']);
  const records: InventoryCandidate[] = [];
  let missingQty = 0;
  let invalidQty = 0;
  for (const row of table.data) {
    const conditionValue = text(row[condition]);
    const locationValue = text(row[location]);
    const skuValue = text(row[sku]);
    const modelValue = text(row[model]);
    if (!skuValue && !modelValue && !locationValue && !conditionValue) continue;
    const parsedQty = parseSourceNumber(row[available]);
    if (parsedQty.kind === 'missing') { missingQty += 1; continue; }
    if (parsedQty.kind === 'invalid') { invalidQty += 1; continue; }
    const availableQty = parsedQty.value;
    if (availableQty < 0) { invalidQty += 1; continue; }
    if (!skuValue || !locationValue || availableQty <= 0 || !STOCK_CONDITIONS.includes(conditionValue as StockCondition)) continue;
    const item: InventoryCandidate = {
      sku: skuValue,
      model: modelValue,
      location: locationValue,
      availableQty,
      condition: conditionValue as StockCondition,
    };
    const containerValue = container === undefined ? '' : text(row[container]);
    if (containerValue) item.container = containerValue;
    records.push(item);
  }
  return { records, missingQty, invalidQty };
}

function columnIndex(table: TypedSheetData, aliases: string[]): number {
  const index = optionalColumnIndex(table, aliases);
  if (index === undefined) throw new Error(`SYSTEM_READ_FAILED: missing column ${aliases.join('/')}`);
  return index;
}

function optionalColumnIndex(table: TypedSheetData, aliases: string[]): number | undefined {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  const index = table.columns.findIndex((column) => normalizedAliases.has(normalizeHeader(column)));
  return index >= 0 ? index : undefined;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[\s_()-]/g, '');
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function sourceNumberOrNull(value: unknown): number | null {
  const parsed = parseSourceNumber(value);
  return parsed.kind === 'valid' ? parsed.value : null;
}

function businessDate(value: unknown): string {
  return text(value).slice(0, 10);
}

function toOperationalLedgerRow(row: TypedSheetData['data'][number], ledgerRow: number): OperationalLedgerRow {
  const qty = parseSourceNumber(row[MAIN.qty]);
  return {
    ledgerRow,
    date: businessDate(row[MAIN.date]), outboundDate: businessDate(row[MAIN.outboundDate]),
    action: text(row[MAIN.action]), sh: text(row[MAIN.sh]), pickupCode: text(row[MAIN.pickup]),
    sku: text(row[MAIN.sku]), model: text(row[MAIN.model]),
    ...(qty.kind === 'valid' ? { qty: qty.value } : {}),
    erpWarehouse: text(row[MAIN.erpWarehouse]), fromLocation: text(row[MAIN.fromLocation]),
    toLocation: text(row[MAIN.toLocation]), container: text(row[MAIN.container]),
    sn: text(row[MAIN.sn]), stockCondition: text(row[MAIN.stockCondition]),
  };
}

function rawInventoryRecords(table: TypedSheetData): Array<LocationInventoryRecord & { sourceRow?: number }> {
  const sourceRow = optionalColumnIndex(table, ['来源行']);
  const location = columnIndex(table, ['Location', '库位', '当前库位', '库位编码']);
  const container = optionalColumnIndex(table, ['Container', '容器', '容器码']);
  const sku = columnIndex(table, ['SKU', '料号', '物料号', '产品料号']);
  const qty = columnIndex(table, ['Available Qty', '可用数量', '可用库存', '可用Qty', '当前数量']);
  const records: Array<LocationInventoryRecord & { sourceRow?: number }> = [];
  for (const row of table.data) {
    const locationValue = text(row[location]);
    const skuValue = text(row[sku]);
    const qtyValue = row[qty];
    if (!locationValue && !skuValue && (qtyValue === null || qtyValue === '')) continue;
    const record: LocationInventoryRecord & { sourceRow?: number } = {
      location: locationValue, sku: skuValue, qty: qtyValue,
    };
    const containerValue = container === undefined ? '' : text(row[container]);
    if (containerValue) record.container = containerValue;
    const source = sourceRow === undefined ? undefined : Number(row[sourceRow]);
    if (source !== undefined && Number.isInteger(source) && source > 0) record.sourceRow = source;
    records.push(record);
  }
  return records;
}

function qtyForPeriod(
  rows: TypedSheetData['data'], dateColumn: number, asOf: BusinessDate, period: 'week' | 'month',
): number {
  const start = period === 'month' ? `${asOf.slice(0, 7)}-01` : mondayOf(asOf);
  return rows.filter((row) => {
    const date = businessDate(row[dateColumn]);
    return date >= start && date <= asOf;
  }).reduce((sum, row) => {
    const qty = parseSourceNumber(row[MAIN.qty]);
    return sum + (qty.kind === 'valid' ? qty.value : 0);
  }, 0);
}

function mondayOf(date: BusinessDate): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() - day + 1);
  return value.toISOString().slice(0, 10);
}
