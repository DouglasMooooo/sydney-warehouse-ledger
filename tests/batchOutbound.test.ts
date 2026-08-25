import assert from 'node:assert/strict';
import test from 'node:test';
import { previewBatchOutbound } from '../src/application/batchOutbound.js';
import type { WarehouseReadPort } from '../src/application/contracts.js';

const port = {
  readDashboardSource:async()=>{throw new Error('unused');}, readPickupCodes:async()=>[], findProduct:async()=>undefined, findAvailableInventory:async()=>[],
  findPreparedByReference:async(reference:string,sn:string)=>({shNo:`SH-${reference}`,pickupCode:reference,sku:`SKU-${sn}`,location:'FLEX-01',erpWarehouse:'悉尼良品仓',stockCondition:'维修良品' as const}),
  findCurrentSerializedInventory:async(sn:string)=>({sn,sku:`SKU-${sn}`,location:'FLEX-01',stockCondition:'维修良品' as const,currentState:'PREPARED' as const}),
} satisfies WarehouseReadPort;

test('batch outbound validates each prepared SN and produces one strict outbound row per machine',async()=>{
  const result=await previewBatchOutbound({date:'2026-08-25',outboundDate:'2026-08-25',items:[{reference:'SYD-00001',sn:'60HD103064PM133'},{reference:'SYD-00002',sn:'60HD153064PM134'}]},port);
  assert.equal(result.items,2); assert.equal(result.rows.length,2);
  assert(result.rows.every(row=>row.action==='出库'&&row.outboundDate==='2026-08-25'&&row.qty===1));
});

test('batch outbound rejects duplicate SN before any write',async()=>{
  await assert.rejects(()=>previewBatchOutbound({date:'2026-08-25',outboundDate:'2026-08-25',items:[{reference:'SYD-00001',sn:'60HD103064PM133'},{reference:'SYD-00002',sn:'60HD103064PM133'}]},port),/DUPLICATE_OR_INCOMPLETE_OUTBOUND_ITEM/);
});
