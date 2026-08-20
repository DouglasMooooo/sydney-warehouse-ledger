import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReadTypedTableInput } from '../src/feishu/read.js';
import { FeishuWarehouseReadAdapter } from '../src/feishu/warehouseReadAdapter.js';
import type { WarehouseSheetReader } from '../src/feishu/sheetReader.js';
import type { TypedSheetData } from '../src/feishu/types.js';
import { parseBusinessDateString } from '../src/ledger/businessDate.js';

const mainHeader = Array.from({ length: 16 }, (_, index) => `C${index + 1}`);
const mainRow: Array<string | number | boolean | null> = Array(16).fill('');
Object.assign(mainRow, { 0: '2026-08-20', 2: '备货', 3: 'SH-1', 4: 'SYD-00001', 6: '00123', 7: 'MODEL-A', 10: 1, 11: 'R1', 15: '维修良品' });

const tables: Record<string, TypedSheetData> = {
  main: typed('主表', mainHeader, [mainHeader, mainRow]),
  inventory: typed('当前库存', ['SKU', 'Model', 'Location', 'Container', 'Available Qty', 'Stock Condition'], [['00123', 'MODEL-A', 'R1', 'BOX-1', 2, '维修良品']]),
  product: typed('产品库存维护', ['SKU', 'Model'], [['00123', 'MODEL-A']]),
  location: typed('库位维护', ['库位编码'], [['R1'], ['R2']]),
};

class StaticTransportReader implements WarehouseSheetReader {
  constructor(readonly transport: 'lark-cli' | 'openapi') {}
  async readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData> {
    const key = input.sheetId === 'main-id' ? 'main' : input.sheetId === 'inventory-id' ? 'inventory'
      : input.sheetName === '产品库存维护' ? 'product' : input.sheetName === '库位维护' ? 'location' : '';
    const table = tables[key];
    if (!table) throw new Error(`missing parity fixture for ${this.transport}`);
    return structuredClone(table);
  }
  async healthCheck(): Promise<boolean> { return true; }
}

test('lark-cli and OpenAPI transport boundaries produce identical logical warehouse reads', async () => {
  const config = { spreadsheetUrl: 'local-only', mainSheetId: 'main-id', currentInventorySheetId: 'inventory-id' };
  const local = new FeishuWarehouseReadAdapter(config, new StaticTransportReader('lark-cli'));
  const hosted = new FeishuWarehouseReadAdapter(config, new StaticTransportReader('openapi'));
  const date = parseBusinessDateString('2026-08-20')!;
  const operations = [
    () => local.readDashboardSource(date), () => hosted.readDashboardSource(date),
    () => local.findProduct('00123'), () => hosted.findProduct('00123'),
    () => local.findAvailableInventory('00123', '维修良品', 1), () => hosted.findAvailableInventory('00123', '维修良品', 1),
    () => local.readTodayTasks(date), () => hosted.readTodayTasks(date),
    () => local.readLocationSummaries(), () => hosted.readLocationSummaries(),
  ];
  const results = await Promise.all(operations.map((operation) => operation()));
  for (let index = 0; index < results.length; index += 2) assert.deepEqual(results[index], results[index + 1]);
});

function typed(name: string, columns: string[], data: TypedSheetData['data']): TypedSheetData {
  return { name, range: 'fixture', columns, data, dtypes: Object.fromEntries(columns.map((column) => [column, 'string'])) };
}
