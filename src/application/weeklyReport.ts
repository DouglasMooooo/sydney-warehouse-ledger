import type { BusinessDate } from '../ledger/businessDate.js';
import type { InventoryCandidate } from './contracts.js';
import { activeOutboundRows, type OperationalLedgerRow } from './todayTasks.js';

export interface WeeklyWarehouseReport {
  asOf: BusinessDate;
  weekStart: string;
  weekEnd: string;
  metrics: {
    returnedForRepair: number;
    repairCompleted: number;
    repairScrapped: number;
    scrapOutbound: number;
    pendingScrap: number | null;
    repairedGoodInbound: number;
    newInbound: number;
    newShipped: number;
    repairedGoodShipped: number;
    preparedDocuments: number;
    outboundDocuments: number;
    currentNew: number;
    currentRepairedGood: number;
    currentPendingRepair: number;
  };
  byModel: Array<{ model: string; newShipped: number; repairedGoodShipped: number; current: number; newStock: number; repairedGoodStock: number }>;
  notes: string[];
}

export interface WeeklyManualMetrics {
  returnedForRepair?: number; repairCompleted?: number; repairScrapped?: number; repairedGoodShipped?: number;
  scrapOutbound?: number; pendingScrap?: number; repairedGoodInbound?: number; currentPendingRepair?: number; currentRepairedGood?: number;
  note?: string;
}

export function deriveWeeklyWarehouseReport(rows: OperationalLedgerRow[], inventory: InventoryCandidate[], asOf: BusinessDate, manual: WeeklyManualMetrics = {}): WeeklyWarehouseReport {
  const weekStart = mondayOf(asOf);
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (date: string) => date >= weekStart && date <= weekEnd;
  const qty = (items: OperationalLedgerRow[]) => items.reduce((sum, row) => sum + (row.qty ?? 0), 0);
  const shipped = activeOutboundRows(rows).filter(row => inWeek(row.outboundDate));
  const returned = rows.filter(row => row.action === '退回维修' && inWeek(row.date));
  const repaired = rows.filter(row => row.action === '库存调增' && row.stockCondition === '维修良品' && inWeek(row.date) && (row.remark ?? '').includes('维修完成'));
  const inbound = rows.filter(row => row.action === '入库' && row.stockCondition === '新机' && inWeek(row.date));
  const prepared = rows.filter(row => row.action === '备货' && inWeek(row.date));
  const current = (condition: string) => inventory.filter(item => item.condition === condition).reduce((sum, item) => sum + item.availableQty, 0);
  const models = new Set<string>([...inventory.map(item => item.displayName??item.model), ...shipped.map(item => item.model)].filter((value):value is string=>Boolean(value)));
  const byModel = [...models].sort().map(model => {
    const stock = inventory.filter(item => (item.displayName??item.model) === model);
    const modelShipped = shipped.filter(item => item.model === model);
    const newStock = stock.filter(item => item.condition === '新机').reduce((sum, item) => sum + item.availableQty, 0);
    const repairedGoodStock = stock.filter(item => item.condition === '维修良品').reduce((sum, item) => sum + item.availableQty, 0);
    return { model,
      newShipped: qty(modelShipped.filter(item => item.stockCondition === '新机')),
      repairedGoodShipped: qty(modelShipped.filter(item => item.stockCondition === '维修良品')),
      current: newStock + repairedGoodStock, newStock, repairedGoodStock };
  }).filter(item => item.current || item.newShipped || item.repairedGoodShipped);
  const documentKey = (row: OperationalLedgerRow) => row.pickupCode || row.sh;
  return {
    asOf, weekStart, weekEnd,
    metrics: {
      returnedForRepair: manual.returnedForRepair ?? qty(returned), repairCompleted: manual.repairCompleted ?? qty(repaired),
      repairScrapped: manual.repairScrapped ?? 0, scrapOutbound: manual.scrapOutbound ?? 0, pendingScrap: manual.pendingScrap ?? null,
      repairedGoodInbound: manual.repairedGoodInbound ?? (manual.repairCompleted ?? qty(repaired)), newInbound: qty(inbound),
      newShipped: qty(shipped.filter(row => row.stockCondition === '新机')),
      repairedGoodShipped: manual.repairedGoodShipped ?? qty(shipped.filter(row => row.stockCondition === '维修良品')),
      preparedDocuments: new Set(prepared.map(documentKey).filter(Boolean)).size,
      outboundDocuments: new Set(shipped.map(documentKey).filter(Boolean)).size,
      currentNew: current('新机'), currentRepairedGood: manual.currentRepairedGood ?? current('维修良品'), currentPendingRepair: manual.currentPendingRepair ?? current('待修'),
    },
    byModel,
    notes: [
      '周区间按 Sydney 周一至周日计算；允许选择周内任意日期。',
      '发货统计未被受控回撤的 Action=出库，并使用实际出库日；备货不扣库存。',
      '维修完成只统计系统生成且备注含“维修完成”的维修良品调增流水。',
      '当前库存为实时快照；固定历史周数据不会被当前台账反算覆盖。',
      ...(manual.note ? [`维修周数据备注：${manual.note}`] : []),
    ],
  };
}

function mondayOf(date: string): string { const value=new Date(`${date}T00:00:00Z`);const day=value.getUTCDay()||7;value.setUTCDate(value.getUTCDate()-day+1);return value.toISOString().slice(0,10); }
function addDays(date: string, days: number): string { const value=new Date(`${date}T00:00:00Z`);value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10); }
