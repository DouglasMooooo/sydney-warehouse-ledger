'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, IdentificationCard, LockSimple, WarningCircle } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { ReturnBatchPreview } from '../../../src/application/returnBatchPreview';
import { ControlledActionPanel } from '../controlled-action-panel';

export function ReturnPreviewClient({ initialBusinessDate }: { initialBusinessDate: string }) {
  const [snText, setSnText] = useState('');
  const [preview, setPreview] = useState<ReturnBatchPreview>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snText.trim()) return;
    setLoading(true); setError(undefined); setPreview(undefined);
    try {
      const response = await fetch('/api/warehouse/returns/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sns: snText }),
      });
      const payload = await response.json() as ApiResponse<ReturnBatchPreview>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setPreview(payload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '系统读取失败');
    } finally { setLoading(false); }
  }

  return <div className="operations-console return-console">
    <aside className="console-rail">
      <ControlledActionPanel action="退回维修" />
      <form className="import-panel" onSubmit={submit}>
        <div className="auto-field"><span>悉尼业务日</span><strong>{initialBusinessDate}</strong><small>系统自动带入</small></div>
        <label>机器 SN（每行一个）<textarea className="sn-batch-input" value={snText} onChange={(event) => setSnText(event.target.value)} placeholder={'SN000001\nSN000002\nSN000003'} /></label>
        <button className="outline-button" disabled={!snText.trim() || loading}><IdentificationCard size={18} />{loading ? '校验 SN…' : '生成返修批次预览'}</button>
      </form>
      <Link className="secondary-workflow" href="/work-orders"><ArrowLeft size={18} /><span><strong>返回库存操作台</strong><small>工单备货与人工确认</small></span></Link>
    </aside>
    <section className="console-main">
      <div className="job-summary"><div><h3>{preview ? `返修批次 · ${preview.lines.length} 台` : '等待输入 SN'}</h3><p>SN → REPAIR-01 · 无需上传工单</p></div><span>只读预览</span></div>
      <div className="job-stats"><span>SN 数量 <b>{preview?.lines.length ?? 0}</b></span><span>目标库位 <b>REPAIR-01</b></span><span>库存属性 <b>待修</b></span></div>
      {error && <div className="inline-alert danger"><WarningCircle size={19} />{error}</div>}
      {!preview && !error && <div className="console-empty"><IdentificationCard size={36} /><strong>粘贴机器 SN</strong><span>一个 SN 一行；系统自动去重，数量固定为 1。</span></div>}
      {preview && <div className="console-table-wrap"><table className="console-table"><thead><tr><th>序号</th><th>SN</th><th>数量</th><th>目标库位</th><th>库存属性</th><th>状态</th></tr></thead><tbody>{preview.lines.map((line, index) => <tr key={line.sn}><td>{index + 1}</td><td>{line.sn}</td><td>{line.qty}</td><td>{line.targetLocation}</td><td>{line.stockCondition}</td><td><span className={`row-status ${line.valid ? 'ok' : 'blocked'}`}>{line.valid ? '通过' : '阻塞'}</span></td></tr>)}</tbody></table></div>}
      {preview?.warnings.map((warning) => <div className="inline-alert warning" key={warning}><WarningCircle size={18} />{warning}</div>)}
    </section>
    <aside className="detail-panel"><h3>返修规则</h3><dl><dt>必填</dt><dd>机器 SN</dd><dt>数量</dt><dd>每个 SN = 1</dd><dt>默认库位</dt><dd>REPAIR-01</dd><dt>库存属性</dt><dd>待修</dd></dl><div className="detail-section"><h4>无需填写</h4><p>无需上传 RMA 工单，也无需填写 SKU、机型和数量。</p></div><button className="locked-action" disabled><LockSimple size={18} />确认返修（UAT 锁定）</button></aside>
  </div>;
}
