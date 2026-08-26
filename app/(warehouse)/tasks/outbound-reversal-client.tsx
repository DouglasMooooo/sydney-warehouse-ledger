'use client';

import { useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { OutboundReversalPreview } from '../../../src/application/outboundReversal';

export function OutboundReversalClient({ businessDate }: { businessDate: string }) {
  const [shNo, setShNo] = useState('');
  const [date, setDate] = useState(businessDate);
  const [preview, setPreview] = useState<OutboundReversalPreview>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(mode: 'preview' | 'confirm') {
    setBusy(true); setError(undefined); setMessage(undefined);
    try {
      const response = await fetch('/api/warehouse/outbound/reversal', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode, date, shNo }),
      });
      const payload = await response.json() as ApiResponse<OutboundReversalPreview & { rows?: number[] }>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      if (mode === 'preview') setPreview(payload.data);
      else {
        setPreview(undefined); setShNo('');
        setMessage(`出库回撤成功，已追加并复核 ${payload.data.rows?.length ?? 0} 条恢复流水。该 SH 已重新进入待取货队列。`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '出库回撤失败'); }
    finally { setBusy(false); }
  }

  function resetPreview() { setPreview(undefined); setMessage('已取消，没有写入台账。'); }

  return <section className="card section-card outbound-reversal">
    <div className="section-heading"><div><p className="eyebrow">CONTROLLED REVERSAL</p><h3>按 SH 单号回撤出库</h3><p>查找该工单尚未回撤的出库流水，恢复到出库前库位。原始出库记录不会被删除。</p></div></div>
    <div className="reversal-search-row">
      <label>SH 单号<input value={shNo} onChange={(event) => { setShNo(event.target.value.toUpperCase()); setPreview(undefined); }} placeholder="SH-2608-00184741" disabled={busy} /></label>
      <label>回撤日期<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(undefined); }} disabled={busy} /></label>
      <button className="execute-button compact" type="button" disabled={busy || !shNo.trim() || Boolean(preview)} onClick={() => submit('preview')}><MagnifyingGlass size={18}/>{busy ? '读取中…' : '查找可回撤记录'}</button>
    </div>
    {error && <div className="inline-alert danger"><WarningCircle size={17}/>{error}</div>}
    {message && <div className="inline-alert success"><CheckCircle size={17}/>{message}</div>}
    {preview && <>
      <div className="reversal-summary"><strong>{preview.shNo}</strong><span>{preview.items.length} 条出库流水将恢复库存</span></div>
      <div className="table-wrap"><table><thead><tr><th>SN</th><th>SKU</th><th>数量</th><th>原库位</th><th>库存属性</th><th>原出库日</th></tr></thead><tbody>{preview.items.map((item) => <tr key={item.ledgerRow}><td>{item.sn || '非序列化'}</td><td>{item.sku}</td><td>{item.qty}</td><td>{item.fromLocation}</td><td>{item.stockCondition}</td><td>{item.outboundDate || '—'}</td></tr>)}</tbody></table></div>
      <div className="batch-confirm-bar reversal-confirm"><span><WarningCircle size={18}/>这是库存写入操作，请核对 SH 和恢复库位。</span><button className="outline-danger" type="button" disabled={busy} onClick={resetPreview}>取消</button><button className="danger-write-button" type="button" disabled={busy} onClick={() => submit('confirm')}><ArrowCounterClockwise size={18}/>{busy ? '写入并复核中…' : `确认回撤 ${preview.items.length} 条`}</button></div>
    </>}
  </section>;
}
