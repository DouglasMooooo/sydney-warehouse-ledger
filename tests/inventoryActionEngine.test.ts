import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION_RULES, prepareInventoryWorkflow } from '../src/application/inventoryActionEngine.js';
import type { WarehouseReadPort } from '../src/application/contracts.js';

const port = {
  readDashboardSource: async()=>{throw new Error('unused');}, readPickupCodes:async()=>[],
  findProduct:async(sku:string)=>({sku,model:'Model'}),
  findAvailableInventory:async()=>[{sku:'SKU1',model:'Model',location:'R1-1-1-L',availableQty:5,condition:'新机' as const}],
  findCurrentSerializedInventory:async(sn:string)=>({sn,sku:'SKU1',location:'REPAIR-01',stockCondition:'待修' as const,currentState:'REPAIR' as const}),
  findPreparedByReference:async()=>({shNo:'SH-1',pickupCode:'SYD-00001',sku:'SKU1',location:'R1-1-1-L',erpWarehouse:'悉尼物料仓',stockCondition:'新机' as const}),
} satisfies WarehouseReadPort;

test('action engine fixes prepare semantics and never exposes an editable action decision',()=>{
  assert.equal(ACTION_RULES.PREPARE.ledgerAction,'备货');
  assert.equal(ACTION_RULES.PREPARE.inventoryEffect,'none');
  assert.equal(ACTION_RULES.OUTBOUND.actualOutboundDateRequired,true);
  assert.equal(ACTION_RULES.OPENING_BALANCE.adminOnly,true);
});

test('move looks up source and preserves condition while total inventory stays unchanged',async()=>{
  const preview=await prepareInventoryWorkflow({workflow:'MOVE',date:'2026-08-25',sn:'SN1',toLocation:'FLEX-01'},port);
  assert.equal(preview.inventoryEffect,'transfer');
  assert.equal(preview.rows[0]?.action,'移库');
  assert.equal(preview.rows[0]?.fromLocation,'REPAIR-01');
  assert.equal(preview.rows[0]?.stockCondition,'待修');
  assert.equal(preview.before?.qty,preview.after?.qty);
});

test('repair complete closes pending repair before creating repaired-good state',async()=>{
  const preview=await prepareInventoryWorkflow({workflow:'REPAIR_COMPLETE',date:'2026-08-25',sn:'60HD103064PM133',toLocation:'R2-1-1-L'},port);
  assert.deepEqual(preview.rows.map(row=>row.action),['库存调减','库存调增']);
  assert.deepEqual(preview.rows.map(row=>row.stockCondition),['待修','维修良品']);
  assert.deepEqual(preview.rows.map(row=>row.sn),['60HD103064PM133','60HD103R64PM133']);
  assert.equal(preview.inventoryEffect,'transfer');
});

test('adjustments require a controlled reason and Other requires a remark',async()=>{
  await assert.rejects(()=>prepareInventoryWorkflow({workflow:'ADJUST_INCREASE',date:'2026-08-25',sku:'SKU1',qty:1,toLocation:'R1',stockCondition:'新机'},port),/ADJUSTMENT_REASON_REQUIRED/);
  await assert.rejects(()=>prepareInventoryWorkflow({workflow:'ADJUST_INCREASE',date:'2026-08-25',sku:'SKU1',qty:1,toLocation:'R1',stockCondition:'新机',adjustmentReason:'Other'},port),/ADJUSTMENT_OTHER_REMARK_REQUIRED/);
});

test('outbound loads the prepared transaction and requires actual outbound date',async()=>{
  await assert.rejects(()=>prepareInventoryWorkflow({workflow:'OUTBOUND',date:'2026-08-25',reference:'SYD-00001',sn:'SN1'},port),/MISSING_OUTBOUND_DATE/);
  const preview=await prepareInventoryWorkflow({workflow:'OUTBOUND',date:'2026-08-25',outboundDate:'2026-08-25',reference:'SYD-00001',sn:'SN1'},port);
  assert.equal(preview.rows[0]?.action,'出库');
  assert.equal(preview.rows[0]?.pickupCode,'SYD-00001');
});
