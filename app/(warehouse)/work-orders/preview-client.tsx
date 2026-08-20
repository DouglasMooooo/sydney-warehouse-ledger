'use client';

import { useState, type FormEvent } from 'react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { WorkOrderBatchPreview } from '../../../src/application/workOrderBatchPreview';

export function WorkOrderPreviewClient({ initialBusinessDate }: { initialBusinessDate: string }) {
  const [businessDate, setBusinessDate] = useState(initialBusinessDate);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<WorkOrderBatchPreview>();
  const [systemError, setSystemError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true); setSystemError(undefined); setPreview(undefined);
    try {
      const form = new FormData();
      form.set('businessDate', businessDate);
      form.set('file', file);
      const response = await fetch('/api/warehouse/work-orders/preview', { method: 'POST', body: form });
      const payload = await response.json() as ApiResponse<WorkOrderBatchPreview>;
      if (!payload.ok) {
        const failure = payload.ok ? { code: 'SYSTEM_READ_FAILED', message: '系统读取失败' } : payload.error;
        throw new Error(`${failure.code} · ${failure.message}`);
      }
      setPreview(payload.data);
    } catch (error) { setSystemError(error instanceof Error ? error.message : '系统读取失败'); }
    finally { setLoading(false); }
  }

  return <div className="workflow-grid">
    <form className="card form-card" onSubmit={submit}>
      <div className="field"><label htmlFor="businessDate">Sydney Business Date</label><input id="businessDate" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} required /></div>
      <div className="field"><label htmlFor="workOrderFile">ERP Work Order (.xlsx · max 5 MiB)</label><input id="workOrderFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0])} required /></div>
      <button className="primary-button" disabled={loading || !file}>{loading ? '服务端解析并读取当前库存…' : '生成 Prepared 预览'}</button>
      <p className="notes">文件只在服务端内存中解析，不会永久保存或发送给外部 AI。</p>
    </form>
    <section className="card preview-card">
      <div className="preview-flow"><span>Upload XLSX</span><b>→</b><span>Server decode</span><b>→</b><span>Replacement only</span><b>→</b><span>Live inventory</span><b>→</b><span>Preview</span></div>
      {systemError && <div className="notice error">{systemError}</div>}
      {!preview && !systemError && <div className="empty-state">选择真实 ERP `.xlsx` 工单。Faulty Unit 内容不会进入 Replacement 预览；任何歧义都会阻止预览。</div>}
      {preview && <BatchResult preview={preview} />}
    </section>
  </div>;
}

function BatchResult({ preview }: { preview: WorkOrderBatchPreview }) {
  return <>
    <div className="data-item"><span>SH</span><strong>{preview.sh ?? '—'}</strong></div>
    {preview.errors.length > 0 && <div className="error-list">{preview.errors.map((error, index) => <div className="error-item" key={`${error.code}-${index}`}><strong>{error.code}</strong> · {error.message}</div>)}</div>}
    {preview.lines.length > 0 && <div className="table-wrap"><table><thead><tr><th>Source row</th><th>SKU</th><th>Model</th><th>Qty</th><th>ERP Warehouse</th><th>Condition</th><th>Recommended</th><th>Container</th><th>Available</th><th>Pickup preview</th></tr></thead><tbody>{preview.lines.map(({ sourceRow, preview: line }, index) => {
      const row = line.proposedPreparedRow;
      return <tr key={`${sourceRow ?? index}-${row?.sku ?? index}`}><td>{sourceRow ?? '—'}</td><td>{row?.sku ?? line.extracted.replacementSku ?? '—'}</td><td>{row?.model ?? '—'}</td><td>{row?.qty ?? line.extracted.qty ?? '—'}</td><td>{row?.erpWarehouse ?? line.extracted.erpWarehouse ?? '—'}</td><td>{row?.stockCondition ?? '—'}</td><td>{row?.fromLocation ?? '—'}</td><td>{row?.container ?? '—'}</td><td>{line.recommendation?.availableQty ?? '—'}</td><td>{line.pickupCode ? `${line.pickupCode.value} · UNRESERVED` : '—'}</td></tr>;
    })}</tbody></table></div>}
    {preview.warnings.map((warning) => <div className="error-item warning-item" key={warning}>{warning}</div>)}
    <button className="confirm-button" disabled>Confirm Prepared · Phase 3 才会启用</button>
  </>;
}
