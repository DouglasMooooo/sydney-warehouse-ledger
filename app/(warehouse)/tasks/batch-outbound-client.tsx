'use client';

import { useState } from 'react';
import { ArrowUUpLeft, CheckCircle, Truck, WarningCircle } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { BatchOutboundPreview } from '../../../src/application/batchOutbound';
import type { OperationalTask } from '../../../src/application/todayTasks';

export function BatchOutboundClient({ tasks, businessDate }: { tasks: OperationalTask[]; businessDate: string }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [outboundDate, setOutboundDate] = useState(businessDate);
  const [preview, setPreview] = useState<BatchOutboundPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const selectable = (task: OperationalTask) => task.details.length > 0 && task.details.every(item => item.sn);
  const items = [...selected].flatMap(index => tasks[index]?.details.map(item => ({ reference: tasks[index]!.pickupCode || tasks[index]!.sh, sn: item.sn! })) ?? []);

  async function submit(mode: 'preview' | 'confirm') {
    if (!items.length) return;
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch('/api/warehouse/outbound/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, date: businessDate, outboundDate, items, ...(mode === 'confirm' ? { commandId: preview?.commandId } : {}) }) });
      const payload = await response.json() as ApiResponse<BatchOutboundPreview & { rows?: number[] }>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      if (mode === 'preview') setPreview(payload.data);
      else { setPreview(undefined); setSelected(new Set()); setMessage(`批量出库成功，已写入并复核 ${payload.data.rows?.length ?? items.length} 行。刷新页面可查看最新状态。`); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '批量出库失败'); }
    finally { setBusy(false); }
  }

  function withdraw() { setPreview(undefined); setSelected(new Set()); setMessage('已回撤本次选择；没有写入台账。'); }

  return <section className="card section-card batch-outbound"><div className="section-heading"><div><h3>待取货 · 批量出库</h3><p>勾选已完成 SN 的 Pickup，先预览，再一次确认出库。</p></div><label>实际出库日<input type="date" value={outboundDate} onChange={event=>setOutboundDate(event.target.value)} /></label></div>
    {error&&<div className="inline-alert danger"><WarningCircle size={17}/>{error}</div>}{message&&<div className="inline-alert success"><CheckCircle size={17}/>{message}</div>}
    {tasks.length===0?<div className="empty-state">当前没有待取货工单</div>:<div className="table-wrap"><table><thead><tr><th>选择</th><th>Pickup</th><th>SH</th><th>SN / SKU / 机型</th><th>来源库位</th><th>状态</th></tr></thead><tbody>{tasks.map((task,index)=>{const allowed=selectable(task);return <tr key={`${task.pickupCode||task.sh}-${index}`}><td><input type="checkbox" disabled={!allowed||Boolean(preview)} checked={selected.has(index)} onChange={()=>{const next=new Set(selected);next.has(index)?next.delete(index):next.add(index);setSelected(next);}} aria-label={`选择 ${task.pickupCode||task.sh}`}/></td><td>{task.pickupCode||'—'}</td><td>{task.sh||'—'}</td><td>{task.details.map(item=>`${item.sn||'缺少SN'} · ${item.sku||'—'}${item.model?` · ${item.model}`:''}`).join('；')}</td><td>{task.details.map(item=>item.location||'—').join('；')}</td><td>{allowed?'可出库':'缺少 SN，不能批量出库'}</td></tr>;})}</tbody></table></div>}
    {preview?<div className="batch-confirm-bar"><span>预览通过：{preview.items} 台、{preview.rows.length} 条出库流水 · 操作编号 {preview.commandId}</span><button className="outline-danger" type="button" onClick={withdraw}><ArrowUUpLeft size={17}/>回撤本次选择</button><button className="confirm-write-button" type="button" disabled={busy} onClick={()=>submit('confirm')}><Truck size={17}/>{busy?'写入并复核中…':'确认批量出库'}</button></div>:<button className="execute-button" type="button" disabled={busy||!items.length} onClick={()=>submit('preview')}><Truck size={18}/>{busy?'校验中…':`批量出库预览（${items.length} 台）`}</button>}
  </section>;
}
