import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmPreparedWorkOrderBatch } from '../src/application/confirmPreparedWorkOrder.js';
import type { WarehouseReadPort } from '../src/application/contracts.js';

const port = {
  readDashboardSource:async()=>{throw new Error('unused');}, readPickupCodes:async()=>['SYD-00009'],
  findProduct:async(sku:string)=>({sku,model:sku==='SKU-GOOD'?'EQ4800-S':'CQ6-S'}),
  findAvailableInventory:async(sku:string,condition:'新机'|'维修良品'|'待修'|'报废'|'物料')=>[{sku,model:'M',location:'FLEX-01',availableQty:10,condition,container:'MIX-01'}],
} satisfies WarehouseReadPort;

test('multi-file preparation keeps work orders separate, assigns unique pickup codes, and returns printable ERP labels',async()=>{
  let captured:unknown;
  const writer={append:async(rows:unknown)=>{captured=rows;return{rows:[20,21,22],verified:true as const,reconciliation:'PASS' as const};}};
  const result=await confirmPreparedWorkOrderBatch({businessDate:'2026-08-25',workOrders:[
    {sh:'SH-1',sourceFileName:'one.xlsx',lines:[{sku:'SKU-GOOD',erpWarehouse:'悉尼良品仓',location:'FLEX-01',locationConfirmed:true,sns:['SN-A'],sourceRow:7}]},
    {sh:'SH-2',sourceFileName:'two.xlsx',lines:[{sku:'SKU-NEW',erpWarehouse:'悉尼物料仓',location:'FLEX-01',locationConfirmed:true,sns:['SN-B','SN-C'],sourceRow:8}]},
  ]},port,writer,{READ_ONLY_RELEASE:'false',CONTROLLED_WRITE_UAT:'true'});
  assert.deepEqual(result.workOrders,[{sh:'SH-1',pickupCode:'SYD-00010'},{sh:'SH-2',pickupCode:'SYD-00011'}]);
  assert.deepEqual(result.labels.map(label=>[label.sh,label.pickupCode,label.lines[0]?.stockCondition,label.lines[0]?.qty]),[
    ['SH-1','SYD-00010','维修良品',1],['SH-2','SYD-00011','新机',2],
  ]);
  const rows=captured as Array<{shNo:string;pickupCode:string;qty:number;erpWarehouse:string;stockCondition:string;remark:string}>;
  assert.equal(rows.length,3);
  assert(rows.every(row=>row.qty===1));
  assert.deepEqual(new Set(rows.filter(row=>row.shNo==='SH-1').map(row=>row.pickupCode)),new Set(['SYD-00010']));
  assert.deepEqual(new Set(rows.filter(row=>row.shNo==='SH-2').map(row=>row.pickupCode)),new Set(['SYD-00011']));
  assert(rows.every(row=>row.remark.includes('Replacement source=')));
});
