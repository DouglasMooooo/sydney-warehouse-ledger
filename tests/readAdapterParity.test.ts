import assert from 'node:assert/strict';
import test from 'node:test';
import type { ReadTypedTableInput } from '../src/feishu/read.js';
import { FeishuWarehouseReadAdapter } from '../src/feishu/warehouseReadAdapter.js';
import type { WarehouseSheetReader } from '../src/feishu/sheetReader.js';
import type { TypedSheetData } from '../src/feishu/types.js';
import { parseBusinessDateString } from '../src/ledger/businessDate.js';
import { compareOpenApiLogicalReads } from '../src/uat/openApiParity.js';

const mainHeader = Array.from({ length: 16 }, (_, index) => `C${index + 1}`);
const mainRow: Array<string | number | boolean | null> = Array(16).fill('');
Object.assign(mainRow, { 0: '2026-08-20', 2: '备货', 3: 'SH-1', 4: 'SYD-00001', 6: '00123', 7: 'MODEL-A', 9: '60HD103064PM133', 10: 1, 11: 'R1', 15: '维修良品', 21: '[SYSTEM_NATIVE] commandId=CMD-00000000-0000-4000-8000-000000000001; movementId=MOV-TEST-0001; idempotencyKey=IDEM-TEST; sourceFingerprint=SRC-TEST' });

const tables: Record<string, TypedSheetData> = {
  main: typed('主表', mainHeader, [mainHeader, mainRow]),
  inventory: typed('当前库存', ['SKU', 'Model', 'Location', 'Container', 'Available Qty', 'Stock Condition'], [['00123', 'MODEL-A', 'R1', 'BOX-1', 2, '维修良品']]),
  product: typed('产品库存维护', ['SKU', 'Model'], [['00123', 'MODEL-A']]),
  location: typed('库位维护', ['库位编码'], [['R1'], ['R2']]),
};

class StaticTransportReader implements WarehouseSheetReader {
  constructor(readonly transport: 'lark-cli' | 'openapi', private readonly mainTable: TypedSheetData = tables.main!) {}
  async readTable(input: Omit<ReadTypedTableInput, 'spreadsheetUrl'>): Promise<TypedSheetData> {
    const key = input.sheetId === 'main-id' ? 'main' : input.sheetId === 'inventory-id' ? 'inventory'
      : input.sheetName === '产品库存维护' ? 'product' : input.sheetName === '库位维护' ? 'location' : '';
    const table = key === 'main' ? this.mainTable : tables[key];
    if (!table) throw new Error(`missing parity fixture for ${this.transport}`);
    return structuredClone(table);
  }
  async healthCheck(): Promise<boolean> { return true; }
}

test('lark-cli and OpenAPI transport boundaries produce identical logical warehouse reads', async () => {
  const config = { spreadsheetUrl: 'local-only', mainSheetId: 'main-id', currentInventorySheetId: 'inventory-id', currentInventoryAuthorityMode: 'EXPLICIT_BASELINE' as const, currentInventoryBaselineEffectiveAt: '2026-08-19T00:00:00+10:00' };
  const local = new FeishuWarehouseReadAdapter(config, new StaticTransportReader('lark-cli'));
  const hosted = new FeishuWarehouseReadAdapter(config, new StaticTransportReader('openapi'));
  const date = parseBusinessDateString('2026-08-20')!;
  const operations = [
    () => local.readDashboardSource(date), () => hosted.readDashboardSource(date),
    () => local.findProduct('00123'), () => hosted.findProduct('00123'),
    () => local.findAvailableInventory('00123', '维修良品', 1), () => hosted.findAvailableInventory('00123', '维修良品', 1),
    () => local.readTodayTasks(date), () => hosted.readTodayTasks(date),
    () => local.readLocationSummaries(), () => hosted.readLocationSummaries(),
    () => local.readSnResolverContext(['60HD103064PM133']), () => hosted.readSnResolverContext(['60HD103064PM133']),
  ];
  const results = await Promise.all(operations.map((operation) => operation()));
  for (let index = 0; index < results.length; index += 2) assert.deepEqual(results[index], results[index + 1]);
  const privacySafe = await compareOpenApiLogicalReads(local, hosted, date, '00123');
  assert.equal(privacySafe.status, 'PASS');
  assert(privacySafe.checks.every((item) => item.status === 'PASS'));
  assert(!JSON.stringify(privacySafe).includes('00123'));
  const resolverContext = await local.readSnResolverContext(['60HD103064PM133']);
  assert.equal(resolverContext.verifiedMappings[0]?.materialCode, '00123');
  assert.equal(resolverContext.verifiedMappings[0]?.canonicalSn, '60HD103*64PM133');
  assert.equal(resolverContext.operationalStates[0]?.currentState, 'UNKNOWN');
  const repairedEncodingContext = await local.readSnResolverContext(['60HD103R64PM133']);
  assert.equal(repairedEncodingContext.verifiedMappings[0]?.materialCode, '00123');
  assert.equal(repairedEncodingContext.verifiedMappings[0]?.canonicalSn, '60HD103*64PM133');
});

test('legacy/manual rows remain available to audit but never create current tasks, dashboard activity, or an SN current state', async () => {
  const legacyRow = [...mainRow];
  legacyRow[2] = '备货'; legacyRow[9] = 'LEGACY-SN-1'; legacyRow[21] = 'Import reference: historical spreadsheet import';
  const main = typed('主表', mainHeader, [mainHeader, legacyRow]);
  const adapter = new FeishuWarehouseReadAdapter({ spreadsheetUrl: 'local-only', mainSheetId: 'main-id', currentInventorySheetId: 'inventory-id', currentInventoryAuthorityMode: 'EXPLICIT_BASELINE', currentInventoryBaselineEffectiveAt: '2026-08-19T00:00:00+10:00' }, new StaticTransportReader('openapi', main));
  const date = parseBusinessDateString('2026-08-20')!;
  const records = await adapter.readLedgerRecords({ sn: 'LEGACY-SN-1' });
  assert.equal(records.length, 1);
  assert.equal(records[0]?.origin, 'MANUAL_IMPORT');
  assert.equal((await adapter.readTodayTasks(date)).awaitingPickup.length, 0);
  assert.equal((await adapter.readDashboardSource(date)).metrics.todayPreparedWorkOrders, 0);
  assert.equal(await adapter.findCurrentSerializedInventory('LEGACY-SN-1'), undefined);
});

function typed(name: string, columns: string[], data: TypedSheetData['data']): TypedSheetData {
  return { name, range: 'fixture', columns, data, dtypes: Object.fromEntries(columns.map((column) => [column, 'string'])) };
}
