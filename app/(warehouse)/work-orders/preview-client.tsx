'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { WorkOrderPreview } from '../../../src/application/workOrderPreview';

export function WorkOrderPreviewClient({ initialBusinessDate }: { initialBusinessDate: string }) {
  const [businessDate, setBusinessDate] = useState(initialBusinessDate);
  const [sourceText, setSourceText] = useState('');
  const [sourceFileName, setSourceFileName] = useState<string>();
  const [preview, setPreview] = useState<WorkOrderPreview>();
  const [systemError, setSystemError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceFileName(file.name);
    setSourceText(await file.text());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setSystemError(undefined); setPreview(undefined);
    try {
      const response = await fetch('/api/warehouse/work-orders/prepare', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ businessDate, sourceText, ...(sourceFileName ? { sourceFileName } : {}) }),
      });
      const payload = await response.json() as WorkOrderPreview | { error: string };
      if (!response.ok || 'error' in payload) throw new Error('error' in payload ? payload.error : 'SYSTEM_READ_FAILED');
      setPreview(payload);
    } catch (error) { setSystemError(String(error)); }
    finally { setLoading(false); }
  }

  return (
    <div className="workflow-grid">
      <form className="card form-card" onSubmit={submit}>
        <div className="field"><label htmlFor="businessDate">Sydney Business Date</label><input id="businessDate" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} required /></div>
        <div className="field"><label htmlFor="workOrderFile">Upload work order (text-compatible)</label><input id="workOrderFile" type="file" accept=".txt,.csv,.md,text/plain,text/csv" onChange={onFile} /></div>
        <div className="field"><label htmlFor="sourceText">Paste work-order information</label><textarea id="sourceText" value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder={'SH: SH-2608-xxxx\nFaulty Unit: ...\nReplacement Unit: 97-xxx\nQty: 1\nERP Warehouse: 悉尼良品仓'} required /></div>
        <button className="primary-button" disabled={loading}>{loading ? '读取当前飞书库存…' : '生成 Prepared 预览'}</button>
      </form>
      <section className="card preview-card">
        <div className="preview-flow"><span>Upload Work Order</span><b>→</b><span>Parsed Replacement</span><b>→</b><span>Validation</span><b>→</b><span>Inventory</span><b>→</b><span>Prepared Preview</span></div>
        {systemError && <div className="notice error">系统读取失败：{systemError}</div>}
        {!preview && !systemError && <div className="empty-state">粘贴工单后生成预览。系统不会把 Faulty Unit 当成 Replacement，也不会写入台账。</div>}
        {preview && <PreviewResult preview={preview} />}
      </section>
    </div>
  );
}

function PreviewResult({ preview }: { preview: WorkOrderPreview }) {
  const row = preview.proposedPreparedRow;
  const items = row ? [
    ['SH', row.sh], ['Pickup', `${row.pickupCode} · Preview only`], ['SKU', row.sku], ['Model', row.model],
    ['Qty', row.qty], ['ERP Warehouse', row.erpWarehouse], ['Recommended Pick', `${row.fromLocation}${row.container ? ` / ${row.container}` : ''}`],
    ['Available', preview.recommendation?.availableQty ?? '—'], ['Condition', row.stockCondition], ['Date', row.date],
  ] : Object.entries(preview.extracted);
  return (
    <>
      {preview.errors.length > 0 && <div className="error-list">{preview.errors.map((error) => <div className="error-item" key={`${error.code}-${error.message}`}><strong>{error.code}</strong> · {error.message}</div>)}</div>}
      <div className="data-list">{items.map(([label, value]) => <div className="data-item" key={label}><span>{label}</span><strong>{String(value ?? '—')}</strong></div>)}</div>
      {preview.warnings.map((warning) => <div className="error-item warning-item" key={warning}>{warning}</div>)}
      <button className="confirm-button" disabled>Confirm Prepared · 下一阶段启用</button>
    </>
  );
}
