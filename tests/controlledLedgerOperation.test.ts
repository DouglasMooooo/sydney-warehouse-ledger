import assert from 'node:assert/strict';
import test from 'node:test';
import { executeControlledBatchInbound, executeControlledBatchTransfer, executeControlledLedgerOperation, previewControlledBatchInbound, previewControlledBatchTransfer } from '../src/application/controlledLedgerOperation.js';
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

test('batch inbound normalizes SNs, blocks duplicates/current stock, and commits one verified batch only when every row is ready',async()=>{
  const inboundPort={...port,findCurrentSerializedInventory:async(sn:string)=>sn==='EXISTING'?{sn,sku:'SKU1',location:'R1-1-1-L',stockCondition:'新机' as const,currentState:'GOOD' as const}:undefined};
  const ready=await previewControlledBatchInbound({date:'2026-08-26',lines:[
    {sn:' sn-new-1 ',sku:'SKU1',toLocation:'R1-1-1-L',stockCondition:'新机'},
    {sn:'SN-NEW-2',sku:'SKU1',toLocation:'R1-1-1-R',stockCondition:'维修良品'},
  ]},inboundPort);
  assert.equal(ready.readyCount,2); assert.equal(ready.blockedCount,0);
  assert.deepEqual(ready.lines.map(item=>item.line.sn),['SN-NEW-1','SN-NEW-2']);
  let rows:readonly unknown[]=[]; let context:unknown;
  const result=await executeControlledBatchInbound({date:'2026-08-26',commandId:ready.commandId,lines:ready.lines.map(item=>item.line)},inboundPort,{append:async(input,writeContext)=>{rows=input;context=writeContext;return{rows:[20,21],verified:true as const,reconciliation:'PASS' as const};}},{READ_ONLY_RELEASE:'false',CONTROLLED_WRITE_UAT:'true'},{createdBy:'UAT_OPERATOR'});
  assert.equal(result.verified,true); assert.equal(rows.length,2); assert.deepEqual(context,{createdBy:'UAT_OPERATOR',commandId:ready.commandId});
  const blocked=await previewControlledBatchInbound({date:'2026-08-26',lines:[
    {sn:'EXISTING',sku:'SKU1',toLocation:'R1-1-1-L',stockCondition:'新机'},
    {sn:'duplicate',sku:'SKU1',toLocation:'R1-1-1-L',stockCondition:'新机'},
    {sn:' DUPLICATE ',sku:'SKU1',toLocation:'R1-1-1-L',stockCondition:'新机'},
  ]},inboundPort);
  assert.equal(blocked.blockedCount,2); assert.match(blocked.warnings[0]??'',/全有或全无/);
  await assert.rejects(()=>executeControlledBatchInbound({date:'2026-08-26',commandId:blocked.commandId,lines:blocked.lines.map(item=>item.line)},inboundPort,{append:async()=>{throw new Error('must not write');}},{READ_ONLY_RELEASE:'false',CONTROLLED_WRITE_UAT:'true'}),/BATCH_INBOUND_BLOCKED_LINES/);
});
