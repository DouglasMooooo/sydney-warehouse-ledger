import assert from 'node:assert/strict';
import test from 'node:test';
import { executeControlledLedgerOperation } from '../src/application/controlledLedgerOperation.js';
import type { WarehouseReadPort } from '../src/application/contracts.js';

const port={findAvailableInventory:async()=>[{sku:'SKU1',model:'M',location:'R1-1-1-L',availableQty:5,condition:'维修良品' as const}],findProduct:async()=>({sku:'SKU1',model:'M'}),readPickupCodes:async()=>[],readDashboardSource:async()=>{throw new Error('unused');},findCurrentSerializedInventory:async()=>({sn:'SN1',sku:'SKU1',location:'R1-1-1-L',availableQty:1,stockCondition:'维修良品' as const,currentState:'GOOD' as const})} satisfies WarehouseReadPort;

test('controlled move trusts current source condition and writes only after server inventory check',async()=>{
  let captured:unknown; const writer={append:async(input:unknown)=>{captured=input;return{rows:[9],verified:true as const,reconciliation:'PASS' as const};}};
  const result=await executeControlledLedgerOperation({workflow:'MOVE',date:'2026-08-25',sn:'SN1',toLocation:'R1-1-1-R'},port,writer,{READ_ONLY_RELEASE:'false',CONTROLLED_WRITE_UAT:'true'});
  assert.equal(result.verified,true);
  assert.equal((captured as Array<{sourceStockCondition:string}>)[0]?.sourceStockCondition,'维修良品');
});

test('controlled write remains blocked when the explicit UAT gate is absent',async()=>{
  await assert.rejects(()=>executeControlledLedgerOperation({workflow:'INBOUND',date:'2026-08-25',sku:'SKU1',sn:'SN2',toLocation:'R1-1-1-L',stockCondition:'新机'},port,{append:async()=>{throw new Error('must not write');}},{READ_ONLY_RELEASE:'false'}),/CONTROLLED_WRITE_UAT/);
});
