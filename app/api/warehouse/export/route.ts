import ExcelJS from 'exceljs';
import { authenticateWarehouseRequest } from '../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { parseBusinessDateString, todayInSydney } from '../../../../src/ledger/businessDate';
import { LiveLedgerAuditService } from '../../../../src/application/auditQueryService';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  authenticateWarehouseRequest(request, 'DASHBOARD_READ');
  const params = new URL(request.url).searchParams;
  const date = parseBusinessDateString(params.get('date')) ?? todayInSydney();
  const adapter = warehouseReadAdapterFromEnv();
  if (params.get('scope') === 'reconciliation') return reconciliationExport(adapter, date);
  const [dashboard, weekly, tasks] = await Promise.all([adapter.readDashboardSource(date), adapter.readWeeklyReport(date), adapter.readTodayTasks(date)]);
  const workbook = new ExcelJS.Workbook(); workbook.creator='Sydney Warehouse Operations'; workbook.created=new Date();
  const overview = workbook.addWorksheet('库存概览');
  addTable(overview, ['指标','数量'], [['新机',dashboard.inventory.newUnits],['维修良品',dashboard.inventory.repairedGood],['待修',dashboard.inventory.pendingRepair],['维修库存',dashboard.inventory.repairInventory],['报废',dashboard.inventory.scrapped], ...dashboard.inventoryByCondition.map(item=>[`库存属性：${item.condition}`,item.availableQty])]);
  const report = workbook.addWorksheet('周报');
  addTable(report, ['周开始','周结束','售后回收入库','维修完成','维修报废','报废出库','待报废','维修良品入库','新机入库','新机发货','维修良品发货','备货单据','出货单据','新机库存','维修良品库存','待修'], [[weekly.weekStart,weekly.weekEnd,weekly.metrics.returnedForRepair,weekly.metrics.repairCompleted,weekly.metrics.repairScrapped,weekly.metrics.scrapOutbound,weekly.metrics.pendingScrap??'',weekly.metrics.repairedGoodInbound,weekly.metrics.newInbound,weekly.metrics.newShipped,weekly.metrics.repairedGoodShipped,weekly.metrics.preparedDocuments,weekly.metrics.outboundDocuments,weekly.metrics.currentNew,weekly.metrics.currentRepairedGood,weekly.metrics.currentPendingRepair]]);
  const models = workbook.addWorksheet('周报机型'); addTable(models,['机型','新机发货','维修良品发货','当前库存','新机库存','维修良品库存'],weekly.byModel.map(item=>[item.model,item.newShipped,item.repairedGoodShipped,item.current,item.newStock,item.repairedGoodStock]));
  const taskSheet=workbook.addWorksheet('待取货'); addTable(taskSheet,['Pickup','SH','SKU','Model','SN','Qty','库位','容器'],tasks.awaitingPickup.flatMap(task=>task.details.map(item=>[task.pickupCode??'',task.sh,item.sku??'',item.model??'',item.sn??'',item.qty??'',item.location??'',item.container??''])));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { 'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition':`attachment; filename="sydney-warehouse-${date}.xlsx"`, 'cache-control':'no-store' } });
}

async function reconciliationExport(adapter: ReturnType<typeof warehouseReadAdapterFromEnv>, date: string) {
  const [audit, inventory] = await Promise.all([
    new LiveLedgerAuditService(adapter).search({ limit: 10_000 }), adapter.readCurrentInventory(),
  ]);
  const workbook = new ExcelJS.Workbook(); workbook.creator = 'Sydney Warehouse Operations'; workbook.created = new Date();
  const ledger = workbook.addWorksheet('操作台账');
  addTable(ledger,
    ['业务日期','实际出库日','动作','Workflow','SH','Pickup Code','容器','SKU','机型','SN','数量','来源库位','目标库位','ERP 仓库','库存属性','备注','Movement ID','来源','校验状态'],
    audit.records.map((item) => [item.businessDate,item.occurredAt??'',item.ledgerAction,item.workflow??'',item.shNo??'',item.pickupCode??'',item.containerCode??'',item.sku??'',item.displayName??'',item.sn??'',item.qty,item.fromLocation??'',item.toLocation??'',item.erpWarehouse??'',item.stockConditionAfter??item.stockConditionBefore??'',item.reason??'',item.movementId,item.origin,item.verificationStatus]),
  );
  const current = workbook.addWorksheet('当前库存');
  addTable(current, ['SKU','机型','SN','库位','容器','可用数量','库存属性'], inventory.map((item) => [item.sku,item.displayName??item.model??'',item.sn??'',item.location,item.container??'',item.availableQty,item.condition]));
  const notes = workbook.addWorksheet('导出说明');
  addTable(notes, ['项目','说明'], [
    ['来源','飞书现有操作台账与当前库存；未使用缓存或独立库存数据库。'],
    ['导出日期',date], ['操作台账条数',audit.records.length],
    ['截断',audit.truncated ? '是：请按日期分段导出。' : '否'],
    ['校验提示',audit.issues.length],
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer), { headers: { 'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition':`attachment; filename="sydney-warehouse-reconciliation-${date}.xlsx"`, 'cache-control':'no-store' } });
}

function addTable(sheet:ExcelJS.Worksheet,headers:string[],rows:Array<Array<string|number>>){sheet.addRow(headers);for(const row of rows)sheet.addRow(row);const header=sheet.getRow(1);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF126E52'}};header.alignment={vertical:'middle'};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns=headers.map((header,index)=>({header,key:String(index),width:Math.max(14,header.length*2+4)}));sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:headers.length}};}
