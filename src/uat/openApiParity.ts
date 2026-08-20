import type { BusinessDate } from '../ledger/businessDate.js';
import type { FeishuWarehouseReadAdapter } from '../feishu/warehouseReadAdapter.js';

export interface ParityCheck { name: string; status: 'PASS' | 'FAIL' | 'SKIPPED'; differenceCount: number }
export interface OpenApiParityResult { status: 'PASS' | 'FAIL'; checks: ParityCheck[] }

export async function compareOpenApiLogicalReads(
  trusted: FeishuWarehouseReadAdapter,
  openApi: FeishuWarehouseReadAdapter,
  date: BusinessDate,
  probeSku?: string,
): Promise<OpenApiParityResult> {
  const [leftDashboard, rightDashboard, leftTasks, rightTasks, leftLayout, rightLayout, leftExceptions, rightExceptions, leftPickup, rightPickup] = await Promise.all([
    trusted.readDashboardSource(date), openApi.readDashboardSource(date),
    trusted.readTodayTasks(date), openApi.readTodayTasks(date),
    trusted.readLocationSummaries(), openApi.readLocationSummaries(),
    trusted.readOperationalExceptions(), openApi.readOperationalExceptions(),
    trusted.readPickupCodes(), openApi.readPickupCodes(),
  ]);
  const checks: ParityCheck[] = [
    compare('Dashboard', dashboardAggregate(leftDashboard), dashboardAggregate(rightDashboard)),
    compare('Today Tasks', taskAggregate(leftTasks), taskAggregate(rightTasks)),
    compare('Warehouse Layout / Current Inventory / Location Master', layoutAggregate(leftLayout), layoutAggregate(rightLayout)),
    compare('Exceptions', exceptionAggregate(leftExceptions.exceptions), exceptionAggregate(rightExceptions.exceptions)),
    compare('Pickup Code reads', pickupAggregate(leftPickup), pickupAggregate(rightPickup)),
  ];
  if (probeSku) {
    const [leftProduct, rightProduct, leftInventory, rightInventory] = await Promise.all([
      trusted.findProduct(probeSku), openApi.findProduct(probeSku),
      trusted.findAvailableInventory(probeSku, '维修良品', 1), openApi.findAvailableInventory(probeSku, '维修良品', 1),
    ]);
    checks.push(compare('Product Master lookup', { found: Boolean(leftProduct), model: leftProduct?.model ?? null }, { found: Boolean(rightProduct), model: rightProduct?.model ?? null }));
    checks.push(compare('Inventory recommendation source', inventoryAggregate(leftInventory), inventoryAggregate(rightInventory)));
  } else {
    checks.push({ name: 'Product Master lookup', status: 'SKIPPED', differenceCount: 0 });
    checks.push({ name: 'Inventory recommendation source', status: 'SKIPPED', differenceCount: 0 });
  }
  return { status: checks.some((item) => item.status === 'FAIL') ? 'FAIL' : 'PASS', checks };
}

function compare(name: string, left: unknown, right: unknown): ParityCheck {
  const pass = JSON.stringify(left) === JSON.stringify(right);
  return { name, status: pass ? 'PASS' : 'FAIL', differenceCount: pass ? 0 : 1 };
}

function dashboardAggregate(value: Awaited<ReturnType<FeishuWarehouseReadAdapter['readDashboardSource']>>) {
  return { metrics: value.metrics, inventory: value.inventory, inventoryByCondition: value.inventoryByCondition, activityBreakdowns: value.activityBreakdowns };
}
function taskAggregate(value: Awaited<ReturnType<FeishuWarehouseReadAdapter['readTodayTasks']>>) {
  return { awaitingPickup: value.awaitingPickup.length, todayOutbound: value.todayOutbound.length, todayReturns: value.todayReturns.length };
}
function layoutAggregate(value: Awaited<ReturnType<FeishuWarehouseReadAdapter['readLocationSummaries']>>) {
  return { locationCount: value.locations.length, totalQty: value.locations.reduce((sum, item) => sum + item.totalQty, 0), issueCount: value.issues.length };
}
function exceptionAggregate(items: Awaited<ReturnType<FeishuWarehouseReadAdapter['readOperationalExceptions']>>['exceptions']) {
  const counts = new Map<string, number>(); for (const item of items) counts.set(item.code, (counts.get(item.code) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}
function pickupAggregate(values: string[]) { return { count: values.length, uniqueCount: new Set(values).size }; }
function inventoryAggregate(values: Awaited<ReturnType<FeishuWarehouseReadAdapter['findAvailableInventory']>>) {
  return { candidateCount: values.length, totalQty: values.reduce((sum, item) => sum + item.availableQty, 0) };
}
