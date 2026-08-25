'use client';

import { useState, type FormEvent } from 'react';
import { ArrowsLeftRight, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { CONTROLLED_UAT_ACTIONS } from '../../../src/application/controlledLedgerOperation';
import { STOCK_CONDITIONS } from '../../../src/config/controlledValues';

export function OperationsClient({ businessDate }: { businessDate: string }) {
  const [action, setAction] = useState<(typeof CONTROLLED_UAT_ACTIONS)[number]>('移库');
  const [state, setState] = useState<'idle'|'busy'|'done'|'error'>('idle');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('busy'); setMessage('');
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    const payload = { ...data, action, qty: Number(data.qty) };
    const response = await fetch('/api/warehouse/operations/execute', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
    const result = await response.json() as {ok:boolean;data?:{rows:number[]};error?:{message:string;code:string}};
    if (!result.ok) { setState('error'); setMessage(`${result.error?.code} · ${result.error?.message}`); return; }
    setState('done'); setMessage(`已写入并复核第 ${result.data?.rows.join(', ')} 行`);
  }
  const source = action === '移库' || action === '库存调减' || action === '出库';
  const target = action === '移库' || action === '库存调增' || action === '入库';
  const outbound = action === '出库';
  return <form className="transaction-console" onSubmit={submit}>
    <div className="transaction-grid">
      <label>库存动作<select value={action} onChange={(e)=>setAction(e.target.value as typeof action)}>{CONTROLLED_UAT_ACTIONS.map(item=><option key={item}>{item}</option>)}</select></label>
      <label>业务日期<input name="date" type="date" defaultValue={businessDate} required /></label>
      {outbound && <label>出库日期<input name="outboundDate" type="date" defaultValue={businessDate} required /></label>}
      <label>料号<input name="sku" placeholder="例如 97-141-00060-B0" required /></label>
      <label>数量<input name="qty" type="number" min="1" step="1" required /></label>
      <label>库存属性<select name="stockCondition">{STOCK_CONDITIONS.map(item=><option key={item}>{item}</option>)}</select></label>
      {source && <label>来源库位<input name="fromLocation" placeholder="R1-2-3-L" required /></label>}
      {target && <label>目标库位<input name="toLocation" placeholder="R1-2-3-R" required /></label>}
      {outbound && <><label>SH 工单号<input name="shNo" required /></label><label>取件码<input name="pickupCode" placeholder="SYD-00000" required /></label><label>ERP 仓库<input name="erpWarehouse" defaultValue="悉尼良品仓" required /></label><label>SN（物料可留空）<input name="sn" /></label></>}
      <label className="transaction-remark">备注<input name="remark" placeholder="UAT 测试原因 / 盘点依据" /></label>
    </div>
    <div className="write-warning"><WarningCircle size={18}/><span>这是实际 UAT 写入。服务端会重新核对来源库存，只写业务列，并在写入后复核日期类型与公式列。</span></div>
    <button className="execute-button" disabled={state==='busy'}><ArrowsLeftRight size={19}/>{state==='busy'?'写入并复核中…':`确认${action}并写入 UAT`}</button>
    {state==='done' && <p className="write-result ok"><CheckCircle size={18}/>{message}</p>}{state==='error' && <p className="write-result error"><WarningCircle size={18}/>{message}</p>}
  </form>;
}
