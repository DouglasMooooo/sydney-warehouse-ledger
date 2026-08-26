import assert from 'node:assert/strict';
import test from 'node:test';
import { executeControlledBatchTransfer, executeControlledLedgerOperation, previewControlledBatchTransfer } from '../src/application/controlledLedgerOperation.js';
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

test('batch move validates every SN and appends one verified transaction set',async()=>{
  let batchReads=0;
  const batchPort={...port,findCurrentSerializedInventory:async()=>{throw new Error('batch cache should serve lookup');},findCurrentSerializedInventoryBatch:async(sns:string[])=>{batchReads+=1;return sns.map(sn=>({sn,sku:'SKU1',location:sn==='SN1'?'R1-1-1-L':'R1-1-1-R',stockCondition:'维修良品' as const,currentState:'GOOD' as const}));}};
  let captured:readonly unknown[]=[];
  const result=await executeControlledBatchTransfer({workflow:'MOVE',date:'2026-08-26',toLocation:'R1-1-2-L',sns:['sn1','SN2']},batchPort,{append:async(rows)=>{captured=rows;return{rows:[10,11],verified:true as const,reconciliation:'PASS' as const};}},{READ_ONLY_RELEASE:'false',CONTROLLED_WRITE_UAT:'true'});
  assert.equal(result.verified,true);
  assert.equal(batchReads,1);
  const typed=captured as ReadonlyArray<{sn?:string;toLocation?:string}>;
  assert.deepEqual(typed.map(item=>item.sn),['SN1','SN2']);
  assert.deepEqual(typed.map(item=>item.toLocation),['R1-1-2-L','R1-1-2-L']);
});

test('batch transfer rejects duplicate SN before any write',async()=>{
  await assert.rejects(()=>previewControlledBatchTransfer({workflow:'MOVE',date:'2026-08-26',toLocation:'R1-1-2-L',sns:['SN1',' sn1 ']},port),/DUPLICATE_IN_BATCH/);
  await assert.rejects(()=>previewControlledBatchTransfer({workflow:'REPAIR_COMPLETE',date:'2026-08-26',toLocation:'R1-1-2-L',sns:Array.from({length:51},(_,index)=>`SN${index}`)},port),/BATCH_SN_LIMIT_EXCEEDED/);
});

test('repair complete batch converts each repaired SN and rejects the repair source as target',async()=>{
  const repairPort={...port,findCurrentSerializedInventory:async(sn:string)=>({sn,sku:'SKU1',location:'REPAIR-01',stockCondition:'待修' as const,currentState:'REPAIR' as const})};
  const preview=await previewControlledBatchTransfer({workflow:'REPAIR_COMPLETE',date:'2026-08-26',toLocation:'R1-2-3-L',sns:['60HD103064PM133','60HD153064PM134']},repairPort);
  assert.equal(preview.items.length,2);
  assert.equal(preview.totalRows,4);
  assert.deepEqual(preview.items.map(item=>item.preview.rows[1]?.sn),['60HD103R64PM133','60HD153R64PM134']);
  await assert.rejects(()=>previewControlledBatchTransfer({workflow:'REPAIR_COMPLETE',date:'2026-08-26',toLocation:'REPAIR-01',sns:['60HD103064PM133']},repairPort),/MOVE_SOURCE_EQUALS_TARGET/);
});
