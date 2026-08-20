import { ACTIONS, STOCK_CONDITIONS, type StockCondition } from '../config/controlledValues.js';
import type { BusinessDate } from '../ledger/businessDate.js';
import type {
  DashboardSnapshot, InventoryCandidate, ProductRecord, WarehouseReadPort,
} from '../application/contracts.js';
import { deriveAwaitingPickupTasks, type DashboardLedgerActivity } from '../application/dashboardMetrics.js';
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
    const exceptionCounts = businessExceptionCounts(mainRows);
    if (inventoryModel.missingQty > 0) exceptionCounts.set('MISSING_INVENTORY_QTY', inventoryModel.missingQty);
    if (inventoryModel.invalidQty > 0) exceptionCounts.set('INVALID_INVENTORY_QTY', inventoryModel.invalidQty);
    const activities = mainRows.map(toDashboardActivity);
    const byModel = new Map<string, number>();
    for (const item of inventoryRows) {
      const key = `${item.model}\u0000${item.condition}`;
      byModel.set(key, (byModel.get(key) ?? 0) + item.availableQty);
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
        awaitingPickup: deriveAwaitingPickupTasks(activities),
        shippedToday: shipped.filter((row) => businessDate(row[MAIN.outboundDate]) === asOf).length,
        returnedToday: returns.filter((row) => businessDate(row[MAIN.date]) === asOf).length,
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
  const available = columnIndex(table, ['Available Qty', '可用数量', '可用库存', '可用Qty']);
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

function businessExceptionCounts(rows: TypedSheetData['data']): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (code: string) => counts.set(code, (counts.get(code) ?? 0) + 1);
  for (const row of rows) {
    const action = text(row[MAIN.action]);
    const qty = row[MAIN.qty];
    const condition = text(row[MAIN.stockCondition]);
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) add('INVALID_ACTION');
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty <= 0) add('INVALID_QTY');
    if (!STOCK_CONDITIONS.includes(condition as StockCondition)) add('INVALID_STOCK_CONDITION');
    if (action !== '退回维修' && !text(row[MAIN.sku])) add('MISSING_SKU');
    if (action === '备货' && !text(row[MAIN.fromLocation])) add('PREPARED_WITHOUT_SOURCE_LOCATION');
    if (action === '备货' && !text(row[MAIN.pickup])) add('PREPARED_WITHOUT_PICKUP_CODE');
    if (action === '退回维修' && !text(row[MAIN.sn])) add('MISSING_SN');
  }
  return counts;
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

function toDashboardActivity(row: TypedSheetData['data'][number]): DashboardLedgerActivity {
  const qty = parseSourceNumber(row[MAIN.qty]);
  const activity: DashboardLedgerActivity = {
    action: text(row[MAIN.action]),
    sh: text(row[MAIN.sh]),
    pickupCode: text(row[MAIN.pickup]),
    sku: text(row[MAIN.sku]),
    outboundDate: text(row[MAIN.outboundDate]),
  };
  if (qty.kind === 'valid') activity.qty = qty.value;
  return activity;
}
