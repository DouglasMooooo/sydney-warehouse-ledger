import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveWeeklyWarehouseReport } from '../src/application/weeklyReport.js';
import { parseBusinessDateString } from '../src/ledger/businessDate.js';
import type { OperationalLedgerRow } from '../src/application/todayTasks.js';
import { businessDateFromSheetValue } from '../src/feishu/warehouseReadAdapter.js';

const base:OperationalLedgerRow={ledgerRow:2,date:'2026-08-24',outboundDate:'',action:'备货',sh:'SH1',pickupCode:'SYD-1',sku:'SKU1',model:'Model A',qty:1,erpWarehouse:'悉尼物料仓',fromLocation:'FLEX-01',toLocation:'',container:'',sn:'SN1',stockCondition:'新机'};

test('weekly report uses Monday-Sunday and actual outbound date with stock condition',()=>{
  const report=deriveWeeklyWarehouseReport([
    base,
    {...base,ledgerRow:3,action:'出库',outboundDate:'2026-08-25'},
    {...base,ledgerRow:4,action:'出库',outboundDate:'2026-08-25',stockCondition:'维修良品'},
    {...base,ledgerRow:5,action:'退回维修',date:'2026-08-26',stockCondition:'待修'},
    {...base,ledgerRow:6,action:'库存调增',date:'2026-08-26',stockCondition:'维修良品',remark:'Repair state correction · 维修完成状态转换'},
  ],[{sku:'SKU1',model:'Model A',location:'R1',availableQty:4,condition:'新机'},{sku:'SKU1',model:'Model A',location:'R2',availableQty:3,condition:'维修良品'}],parseBusinessDateString('2026-08-25')!);
  assert.equal(report.weekStart,'2026-08-24'); assert.equal(report.weekEnd,'2026-08-30');
  assert.equal(report.metrics.newShipped,1); assert.equal(report.metrics.repairedGoodShipped,1);
  assert.equal(report.metrics.returnedForRepair,1); assert.equal(report.metrics.repairCompleted,1);
  assert.deepEqual(report.byModel[0],{model:'Model A',newShipped:1,repairedGoodShipped:1,current:7,newStock:4,repairedGoodStock:3});
});

test('Feishu numeric and Australian display dates become ISO business dates',()=>{
  assert.equal(businessDateFromSheetValue(46259),'2026-08-25');
  assert.equal(businessDateFromSheetValue('25/08/2026'),'2026-08-25');
});

test('weekly manual repair metrics override only fields that the ledger cannot reliably derive',()=>{
  const report=deriveWeeklyWarehouseReport([base],[],parseBusinessDateString('2026-08-25')!,{repairCompleted:74,repairScrapped:13,pendingScrap:42,currentPendingRepair:358,currentRepairedGood:188,note:'formal repair team snapshot'});
  assert.equal(report.metrics.repairCompleted,74); assert.equal(report.metrics.repairScrapped,13);
  assert.equal(report.metrics.pendingScrap,42); assert.equal(report.metrics.currentPendingRepair,358); assert.equal(report.metrics.currentRepairedGood,188);
  assert(report.notes.some(note=>note.includes('formal repair team snapshot')));
});
