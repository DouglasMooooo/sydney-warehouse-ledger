import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parseMoveClientDto, parseWorkOrderPreviewClientDto } from '../src/application/clientDtos.js';
import type { DashboardSnapshot, InventoryCandidate, ProductRecord, WarehouseReadPort } from '../src/application/contracts.js';
import { LiveDashboardQueryService } from '../src/application/dashboardService.js';
import {
  nextPickupCode, parseWorkOrderText, preparedConditionForWarehouse, prepareWorkOrderPreview,
} from '../src/application/workOrderPreview.js';
import { normalizeBusinessDate, todayInSydney } from '../src/ledger/businessDate.js';

const BUSINESS_DATE = normalizeBusinessDate('2026-08-20')!;
const VALID_TEXT = 'SH: SH-2608-0001\nFaulty Unit: BAD-001\nReplacement Unit: 97-GOOD\nQty: 1\nERP Warehouse: 悉尼良品仓';

class FakeReadPort implements WarehouseReadPort {
  dashboardReads = 0;
  product: ProductRecord | undefined = { sku: '97-GOOD', model: 'CQ6-S' };
  inventory: InventoryCandidate[] = [{
    sku: '97-GOOD', model: 'CQ6-S', location: 'R2-1-5-R', container: 'Mix001',
    availableQty: 4, condition: '维修良品',
  }];
  pickupCodes = ['SYD-00008', 'SYD-00010'];

  async readDashboardSource(asOf: typeof BUSINESS_DATE): Promise<DashboardSnapshot> {
    this.dashboardReads += 1;
    return {
      businessDate: asOf,
      metrics: { todayNewWorkOrders: 1, awaitingPreparation: null, awaitingPickup: 2, shippedToday: 3, returnedToday: 1, exceptionCount: 0 },
      inventory: { newUnits: 4, repairedGood: 2, pendingRepair: 1, repairInventory: 3, scrapped: 0 },
      inventoryByModel: [], recentPrepared: [], recentReturns: [], exceptions: [], notes: [],
    };
  }
  async findProduct(sku: string) { return this.product?.sku === sku ? this.product : undefined; }
  async findAvailableInventory(sku: string, condition: InventoryCandidate['condition']) {
    return this.inventory.filter((item) => item.sku === sku && item.condition === condition);
  }
  async readPickupCodes() { return this.pickupCodes; }
}

test('Dashboard reads current source on every request and uses Sydney BusinessDate', async () => {
  const port = new FakeReadPort();
  const service = new LiveDashboardQueryService(port);
  const asOf = todayInSydney(new Date('2026-08-19T14:00:00Z'));
  assert.equal(asOf, '2026-08-20');
  assert.equal((await service.getSnapshot(asOf)).businessDate, '2026-08-20');
  await service.getSnapshot(asOf);
  assert.equal(port.dashboardReads, 2, 'dashboard must not use a shadow/cached inventory snapshot');
});

test('Faulty Unit is never treated as Replacement and missing Replacement is blocked', async () => {
  assert.equal(parseWorkOrderText('SH: SH1\nFaulty Unit: BAD-001\nQty: 1').replacementSku, undefined);
  const preview = await prepareWorkOrderPreview({
    businessDate: BUSINESS_DATE, sourceText: 'SH: SH1\nFaulty Unit: BAD-001\nQty: 1\nERP Warehouse: Sydney',
  }, new FakeReadPort());
  assert(preview.errors.some((error) => error.code === 'REPLACEMENT_NOT_CLEAR'));
  assert.equal(preview.zeroWritesPerformed, true);
});

test('invalid SKU and insufficient stock are visible errors', async () => {
  const invalidSkuPort = new FakeReadPort();
  invalidSkuPort.product = undefined;
  const invalid = await prepareWorkOrderPreview({ businessDate: BUSINESS_DATE, sourceText: VALID_TEXT }, invalidSkuPort);
  assert(invalid.errors.some((error) => error.code === 'SKU_NOT_FOUND'));

  const stockPort = new FakeReadPort();
  stockPort.inventory = [{ ...stockPort.inventory[0]!, availableQty: 0 }];
  const insufficient = await prepareWorkOrderPreview({ businessDate: BUSINESS_DATE, sourceText: VALID_TEXT }, stockPort);
  assert(insufficient.errors.some((error) => error.code === 'INSUFFICIENT_STOCK'));
});

test('Prepared preview recommends only a real inventory candidate and performs zero writes', async () => {
  const port = new FakeReadPort();
  const preview = await prepareWorkOrderPreview({ businessDate: BUSINESS_DATE, sourceText: VALID_TEXT }, port);
  assert.equal(preview.errors.length, 0);
  assert.equal(preview.recommendation, port.inventory[0]);
  assert.equal(preview.proposedPreparedRow?.fromLocation, 'R2-1-5-R');
  assert.equal(preview.proposedPreparedRow?.container, 'Mix001');
  assert.equal(preview.proposedPreparedRow?.outboundDate, null);
  assert.equal(preview.pickupCode?.value, 'SYD-00011');
  assert.equal(preview.pickupCode?.committed, false);
  assert.equal(preview.zeroWritesPerformed, true);
});

test('Prepared stock condition is a deterministic server rule, not an AI or client choice', async () => {
  assert.equal(preparedConditionForWarehouse('悉尼良品仓'), '维修良品');
  assert.equal(preparedConditionForWarehouse('Sydney Repaired Good Warehouse'), '维修良品');
  assert.equal(preparedConditionForWarehouse('悉尼新机仓'), '新机');

  const port = new FakeReadPort();
  port.inventory.unshift({ ...port.inventory[0]!, condition: '新机', location: 'R1-1-1-L' });
  const preview = await prepareWorkOrderPreview({ businessDate: BUSINESS_DATE, sourceText: VALID_TEXT }, port);
  assert.equal(preview.recommendation?.condition, '维修良品');
  assert.equal(preview.recommendation?.location, 'R2-1-5-R');
});

test('Pickup Code preview is deterministic', () => {
  assert.equal(nextPickupCode(['bad', 'SYD-00002', 'SYD-00009']), 'SYD-00010');
  assert.equal(nextPickupCode(['SYD-00009', 'SYD-00002']), 'SYD-00010');
});

test('client DTO rejects trusted state, Date objects, and arbitrary cell coordinates', () => {
  assert.throws(() => parseMoveClientDto({
    businessDate: '2026-08-20', sn: 'SN1', targetLocation: 'R2', sourceStockCondition: '新机',
  }), /UNSUPPORTED_CLIENT_FIELD:sourceStockCondition/);
  assert.throws(() => parseWorkOrderPreviewClientDto({
    businessDate: new Date(), sourceText: VALID_TEXT,
  }), /businessDate must be text/);
  assert.throws(() => parseWorkOrderPreviewClientDto({
    businessDate: '2026-08-20', sourceText: VALID_TEXT, cell: 'A2000', proposedChanges: [],
  }), /UNSUPPORTED_CLIENT_FIELD:cell/);
});

test('preview route exposes no raw Feishu write primitive or spreadsheet coordinates', () => {
  const route = readFileSync('app/api/warehouse/work-orders/prepare/route.ts', 'utf8');
  assert(!route.includes('writeExplicitCells'));
  assert(!route.includes('FEISHU_SPREADSHEET_URL'));
  assert(!route.includes('ProposedChange'));
});
