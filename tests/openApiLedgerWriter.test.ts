import assert from 'node:assert/strict';
import test from 'node:test';
import { OpenApiLedgerWriter } from '../src/feishu/openApiLedgerWriter.js';
import type { WarehouseSheetReader } from '../src/feishu/sheetReader.js';
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
  const reader:WarehouseSheetReader={async readTable(){return{name:'main',range:'A1:AC2',columns:[],data:[Array(29).fill(''),['2026-08-24']],dtypes:{}};},async healthCheck(){return true;}};
  const result=await new OpenApiLedgerWriter('token','main',client,reader).append([{date:'2026-08-25',action:'入库',sku:'00123',qty:2,toLocation:'R1-1-1-L',stockCondition:'新机',remark:'UAT'}]);
  assert.deepEqual(result,{rows:[3],verified:true,reconciliation:'PASS'});
  assert.equal(puts.length,1);
  assert.deepEqual(puts[0],{appendStyle:{range:'main!A3:A3',style:{formatter:'yyyy-mm-dd'}}});
  assert.equal(posts.length,1);
  const ranges=(posts[0] as {valueRanges:Array<{range:string;values:unknown[][]}>}).valueRanges;
  assert(ranges.some(item=>item.range==='main!A3:A3'&&typeof item.values[0]?.[0]==='number'));
  assert(!ranges.some(item=>/!H3:H3|!I3:I3|!O3:O3/.test(item.range)));
});
