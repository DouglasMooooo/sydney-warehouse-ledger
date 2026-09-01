import assert from 'node:assert/strict';
import test from 'node:test';
import { createMovementIdentity, nextAppendBusinessRow, OpenApiLedgerWriter, parseSystemLedgerMarker } from '../src/feishu/openApiLedgerWriter.js';
import { assertMainLedgerSchema } from '../src/config/ledgerSchema.js';
import { prepareLedgerWrite } from '../src/ledger/typedWrite.js';
import type { WarehouseSheetReader } from '../src/feishu/sheetReader.js';
import { FeishuOpenApiError } from '../src/feishu/openApiClient.js';
import type { FeishuOpenApiClient } from '../src/feishu/openApiClient.js';

test('OpenAPI writer preserves numeric date formatting and protected formulas end-to-end', async () => {
  const posts:unknown[]=[]; const puts:unknown[]=[]; let rawReads=0;
  const formulaRow=Array(29).fill(''); formulaRow[7]='=FORMULA';
  const written=Array(29).fill(''); written[0]=46259; written[2]='入库'; written[6]='00123'; written[10]=2; written[12]='R1-1-1-L'; written[15]='新机'; written[21]='UAT';
  const formatted=[...written]; formatted[0]='2026-08-25';
  const client={
    async get(_path:string,params:Record<string,string>){
      if(params.valueRenderOption==='UnformattedValue') return {valueRange:{values:rawReads++===0?[Array(29).fill('')]:[written]}};
      if(params.valueRenderOption==='FormattedValue') return {valueRange:{values:[formatted]}};
      return {valueRange:{values:[formulaRow]}};
    },
    async post(_path:string,body:unknown){posts.push(body);return{};},
    async put(_path:string,body:unknown){puts.push(body);return{};},
  } as unknown as FeishuOpenApiClient;
  const reader:WarehouseSheetReader={async readTable(input){return{name:'main',range:'A1:AC2',columns:headers(),data:input.noHeader?[headers(),['2026-08-24']]:[['2026-08-24']],dtypes:{}};},async healthCheck(){return true;}};
  const result=await new OpenApiLedgerWriter('token','main',client,reader).append([{date:'2026-08-25',action:'入库',sku:'00123',qty:2,toLocation:'R1-1-1-L',stockCondition:'新机',remark:'UAT'}]);
  assert.deepEqual(result,{rows:[3],verified:true,reconciliation:'PASS'});
  assert.equal(puts.length,1);
  assert.deepEqual(puts[0],{appendStyle:{range:'main!A3:A3',style:{formatter:'yyyy-MM-dd'}}});
  assert.equal(posts.length,1);
  const ranges=(posts[0] as {valueRanges:Array<{range:string;values:unknown[][]}>}).valueRanges;
  assert(ranges.some(item=>item.range==='main!A3:A3'&&typeof item.values[0]?.[0]==='number'));
  assert(!ranges.some(item=>/!H3:H3|!I3:I3|!O3:O3/.test(item.range)));
});

test('writer fails closed on header mismatch and treats an existing idempotency marker as already committed', async () => {
  const input={date:'2026-08-25',action:'入库' as const,sku:'00123',qty:1,toLocation:'R1-1-1-L',stockCondition:'新机' as const};
  const prepared=prepareLedgerWrite(input,false); assert(prepared.ok);
  const commandId='CMD-00000000-0000-4000-8000-000000000001';
  const identity=createMovementIdentity(prepared.normalized!,commandId,0);
  const existing=Array(29).fill(''); existing[21]=`[SYSTEM_NATIVE] commandId=${identity.commandId}; movementId=${identity.movementId}; idempotencyKey=${identity.idempotencyKey}; sourceFingerprint=${identity.sourceFingerprint}; createdBy=u1; source=WAREHOUSE_APP`;
  let posts=0;
  const client={async get(){return{valueRange:{values:[Array(29).fill('')]}};},async post(){posts+=1;return{};},async put(){return{};}} as unknown as FeishuOpenApiClient;
  const reader:WarehouseSheetReader={async readTable(input){return{name:'main',range:'A1:AC2',columns:headers(),data:input.noHeader?[headers(),existing]:[existing],dtypes:{}};},async healthCheck(){return true;}};
  const result=await new OpenApiLedgerWriter('token','main',client,reader).append([input],{createdBy:'u1',commandId});
  assert.equal(result.status,'ALREADY_COMMITTED'); assert.equal(posts,0); assert.deepEqual(result.rows,[2]);
  const invalidReader:WarehouseSheetReader={async readTable(){return{name:'main',range:'A1',columns:[],data:[],dtypes:{}};},async healthCheck(){return true;}};
  await assert.rejects(()=>new OpenApiLedgerWriter('token','main',client,invalidReader).append([input],{createdBy:'u1',commandId}),/OPERATIONAL_LEDGER_SCHEMA_MISMATCH/);
});

test('approved UAT required-stock-condition header remains a valid ledger schema', () => {
  const uatHeaders = headers();
  uatHeaders[15] = '库存属性（必填）';
  assert.doesNotThrow(() => assertMainLedgerSchema(uatHeaders));
});

test('falls back to single-range values PUT when Feishu batch write returns 90204', async () => {
  const puts: unknown[] = [];
  let rawReads = 0;
  const written = Array(29).fill(''); written[0] = 46259; written[2] = '入库'; written[6] = '00123'; written[10] = 1; written[12] = 'R1-1-1-L'; written[15] = '新机'; written[21] = 'UAT';
  const client = {
    async get(_path: string, params: Record<string, string>) {
      if (params.valueRenderOption === 'UnformattedValue') return { valueRange: { values: [rawReads++ === 0 ? Array(29).fill('') : written] } };
      if (params.valueRenderOption === 'FormattedValue') { const formatted = [...written]; formatted[0] = '2026-08-25'; return { valueRange: { values: [formatted] } }; }
      return { valueRange: { values: [Array(29).fill('')] } };
    },
    async post() { throw new FeishuOpenApiError('Feishu post failed (90204): valueRange is wrong'); },
    async put(_path: string, body: unknown) { puts.push(body); return {}; },
  } as unknown as FeishuOpenApiClient;
  const reader: WarehouseSheetReader = { async readTable(input) { return { name: 'main', range: 'A1:AC2', columns: headers(), data: input.noHeader ? [headers(), ['2026-08-24']] : [['2026-08-24']], dtypes: {} }; }, async healthCheck() { return true; } };
  const result = await new OpenApiLedgerWriter('token', 'main', client, reader).append([{ date: '2026-08-25', action: '入库', sku: '00123', qty: 1, toLocation: 'R1-1-1-L', stockCondition: '新机', remark: 'UAT' }]);
  assert.equal(result.verified, true);
  assert.ok(puts.length > 0);
  const valuePut = puts.find((item) => (item as { valueRange?: unknown }).valueRange) as { valueRange: { range: string } } | undefined;
  assert.equal(valuePut?.valueRange.range, 'main!A3:A3');
});

test('true append ordering keeps historical gaps untouched and command identities separate equal business commands', () => {
  const rows=Array.from({length:102},()=>Array(29).fill(''));
  rows[99]![2]='入库'; rows[101]![2]='入库';
  assert.equal(nextAppendBusinessRow(rows),103);
  const prepared=prepareLedgerWrite({date:'2026-08-25',action:'入库',sku:'00123',qty:1,toLocation:'R1-1-1-L',stockCondition:'新机'},false); assert(prepared.ok);
  const one=createMovementIdentity(prepared.normalized!,'CMD-00000000-0000-4000-8000-000000000011',0);
  const two=createMovementIdentity(prepared.normalized!,'CMD-00000000-0000-4000-8000-000000000012',0);
  assert.notEqual(one.idempotencyKey,two.idempotencyKey); assert.equal(one.sourceFingerprint,two.sourceFingerprint);
  assert.equal(parseSystemLedgerMarker(`[SYSTEM_NATIVE] commandId=${one.commandId}; idempotencyKey=${one.idempotencyKey}; sourceFingerprint=${one.sourceFingerprint}`).commandId,one.commandId);
});

function headers(): string[] { const row=Array(29).fill('辅助列'); Object.assign(row,{0:'日期',1:'实际出库日',2:'动作',3:'ERP SH单号',4:'取货码',5:'容器码',6:'料号',9:'机器唯一码（SN）',10:'数量',11:'来源库位',12:'目标库位',13:'ERP仓库选择',15:'库存属性',21:'备注'}); return row; }
