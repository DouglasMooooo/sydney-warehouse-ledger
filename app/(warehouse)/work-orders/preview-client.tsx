'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle, FileXls, MagnifyingGlass, MapPin, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import { evaluatePreparedCompletion } from '../../../src/application/preparedCompletion';
import type { WorkOrderBatchPreview } from '../../../src/application/workOrderBatchPreview';
import type { LedgerAction } from '../../../src/config/controlledValues';
import { ControlledActionPanel } from '../controlled-action-panel';
import { WarehouseMatrix, type MatrixLocation } from '../warehouse-layout/warehouse-matrix';

interface LineDraft { snText: string; location: string; locationConfirmed: boolean }

export function WorkOrderPreviewClient({ initialBusinessDate, locations }: { initialBusinessDate: string; locations: MatrixLocation[] }) {
  const [businessDate, setBusinessDate] = useState(initialBusinessDate);
  const [action, setAction] = useState<LedgerAction>('备货');
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<WorkOrderBatchPreview>();
  const [systemError, setSystemError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, LineDraft>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true); setSystemError(undefined); setPreview(undefined); setDrafts({});
    try {
      const form = new FormData(); form.set('businessDate', businessDate); form.set('file', file);
      const response = await fetch('/api/warehouse/work-orders/preview', { method: 'POST', body: form });
      const payload = await response.json() as ApiResponse<WorkOrderBatchPreview>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setPreview(payload.data); setSelected(0);
    } catch (error) { setSystemError(error instanceof Error ? error.message : '系统读取失败'); }
    finally { setLoading(false); }
  }

  function updateDraft(index: number, patch: Partial<LineDraft>) {
    setDrafts((current) => ({ ...current, [index]: { snText: '', location: '', locationConfirmed: false, ...current[index], ...patch } }));
  }

  async function confirmBatch() {
    if (!preview) return;
    setConfirming(true); setConfirmResult(undefined); setSystemError(undefined);
    try {
      const lines = preview.lines.map((item,index)=>{
        const row=item.preview.proposedPreparedRow; const draft=drafts[index]!;
        return {sku:row!.sku,erpWarehouse:row!.erpWarehouse,location:draft.location,locationConfirmed:draft.locationConfirmed,sns:draft.snText.split(/\r?\n/).map(value=>value.trim()).filter(Boolean)};
      });
      const response=await fetch('/api/warehouse/work-orders/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({businessDate,sh:preview.sh,lines})});
      const payload=await response.json() as ApiResponse<{rows:number[];pickupCode:string}>;
      if(!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setConfirmResult(`备货已写入第 ${payload.data.rows.join(', ')} 行；取件码 ${payload.data.pickupCode}`);
    } catch(error){setSystemError(error instanceof Error?error.message:'备货写入失败');} finally{setConfirming(false);}
  }

  const rows = preview?.lines ?? [];
  const active = rows[selected]?.preview;
  const activeDraft = drafts[selected] ?? { snText: '', location: '', locationConfirmed: false };
  const completion = active ? evaluatePreparedCompletion({
    expectedQty: active.proposedPreparedRow?.qty ?? active.extracted.qty ?? 0,
    snText: activeDraft.snText,
    confirmedLocation: activeDraft.location,
    locationConfirmed: activeDraft.locationConfirmed,
    pickupCode: active.pickupCode?.value,
  }) : undefined;
  const activeReady = Boolean(completion?.ready && active?.errors.length === 0);
  const errorCount = preview?.errors.length ?? 0;
  const matchedCount = rows.filter((item) => item.preview.proposedPreparedRow && item.preview.errors.length === 0).length;
  const completedDrafts = rows.filter((item, index) => {
    const draft = drafts[index] ?? { snText: '', location: '', locationConfirmed: false };
    return item.preview.errors.length === 0 && evaluatePreparedCompletion({ expectedQty: item.preview.proposedPreparedRow?.qty ?? 0, snText: draft.snText, confirmedLocation: draft.location, locationConfirmed: draft.locationConfirmed, pickupCode: item.preview.pickupCode?.value }).ready;
  }).length;
  const batchReady=Boolean(rows.length>0&&completedDrafts===rows.length&&errorCount===0);
  const fileName = file?.name ?? '尚未选择工单';
  const searchLabel = useMemo(() => preview ? `${rows.length} 行 · ${completedDrafts} 行资料完整` : '等待导入工单', [preview, rows.length, completedDrafts]);

  return <div className="operations-console">
    <aside className="console-rail">
      <ControlledActionPanel action={action} onActionChange={setAction} />
      <form onSubmit={submit} className="import-panel">
        <label>悉尼业务日<input type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} required /></label>
        <input ref={fileInput} className="sr-only" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0])} />
        <button className="file-picker" type="button" onClick={() => fileInput.current?.click()}><FileXls size={21} /><span>{fileName}</span></button>
        <button className="outline-button" disabled={loading || !file} type="submit"><UploadSimple size={18} />{loading ? '解析工单与库存…' : '导入工单'}</button>
      </form>
      <Link className="secondary-workflow" href="/returns"><span><strong>坏机接收</strong><small>SN 自动识别料号，默认 REPAIR-01</small></span><ArrowRight size={18} /></Link>
    </aside>
    <section className="console-main">
      <div className="job-summary"><div><h3>{preview?.sh ?? '库存操作台 · 等待导入工单'}</h3><p>{fileName}</p></div><span>{preview ? '备货资料录入' : '未开始'}</span></div>
      <div className="job-stats"><span>工单行 <b>{rows.length}</b></span><span>库存匹配 <b>{matchedCount}</b></span><span>资料完整 <b>{completedDrafts}</b></span><span>阻塞 <b>{errorCount}</b></span></div>
      <div className="table-tools"><div><MagnifyingGlass size={17} />{searchLabel}</div><span>取件码：系统自动生成</span><span>库位：人工最终确认</span></div>
      {systemError && <div className="inline-alert danger"><WarningCircle size={19} />{systemError}</div>}
      {confirmResult && <div className="inline-alert success"><CheckCircle size={19}/>{confirmResult}</div>}
      {!preview && !systemError && <div className="console-empty"><UploadSimple size={36} /><strong>导入一份仓库工单</strong><span>系统读取 Replacement Information，匹配库存后进入 SN 与库位确认。</span></div>}
      {preview && <div className="console-table-wrap"><table className="console-table"><thead><tr><th>行</th><th>SKU</th><th>机型</th><th>数量</th><th>自动取件码</th><th>建议库位</th><th>人工资料</th><th>状态</th></tr></thead><tbody>{rows.map((item, index) => {
        const row = item.preview.proposedPreparedRow; const blocked = item.preview.errors.length > 0;
        const draft = drafts[index] ?? { snText: '', location: '', locationConfirmed: false };
        const ready = evaluatePreparedCompletion({ expectedQty: row?.qty ?? 0, snText: draft.snText, confirmedLocation: draft.location, locationConfirmed: draft.locationConfirmed, pickupCode: item.preview.pickupCode?.value }).ready;
        return <tr className={selected === index ? 'selected' : ''} onClick={() => setSelected(index)} key={`${item.sourceRow ?? index}-${row?.sku ?? index}`}><td>{item.sourceRow ?? '—'}</td><td>{row?.sku ?? item.preview.extracted.replacementSku ?? '—'}</td><td>{row?.model ?? '—'}</td><td>{row?.qty ?? item.preview.extracted.qty ?? '—'}</td><td>{item.preview.pickupCode?.value ?? '—'}</td><td>{item.preview.recommendation?.location ?? '—'}</td><td>{ready ? 'SN + 库位已确认' : '等待人工填写'}</td><td><span className={`row-status ${blocked ? 'blocked' : ready ? 'ok' : 'pending'}`}>{blocked ? '阻塞' : ready ? '可完成' : '待确认'}</span></td></tr>;
      })}</tbody></table></div>}
      {preview?.warnings.map((warning) => <div className="inline-alert warning" key={warning}><WarningCircle size={18} />{warning}</div>)}
    </section>
    <aside className="detail-panel prepared-detail"><h3>备货确认</h3>{!active ? <div className="detail-empty">选择一行，人工填写 SN 和最终库位。</div> : <>
      <dl><dt>SKU</dt><dd>{active.proposedPreparedRow?.sku ?? active.extracted.replacementSku ?? '—'}</dd><dt>数量</dt><dd>{active.proposedPreparedRow?.qty ?? active.extracted.qty ?? '—'}</dd><dt>自动取件码</dt><dd className="pickup-code">{active.pickupCode?.value ?? '未生成'}</dd><dt>系统建议库位</dt><dd>{active.recommendation?.location ?? '无可用库位'}</dd></dl>
      <div className="detail-section completion-fields"><label>机器 SN（每台一行）<textarea value={activeDraft.snText} onChange={(event) => updateDraft(selected, { snText: event.target.value })} placeholder={`需要填写 ${active.proposedPreparedRow?.qty ?? active.extracted.qty ?? 0} 个 SN`} /></label><label>最终来源库位<input value={activeDraft.location} readOnly placeholder="请从仓库图选择" /></label><button type="button" className="map-select-button" onClick={()=>setMapOpen(true)}><MapPin size={17}/>{activeDraft.location?`已选择 ${activeDraft.location}`:'打开仓库图选择可用库位'}</button><label className="confirm-location"><input type="checkbox" checked={activeDraft.locationConfirmed} onChange={(event) => updateDraft(selected, { locationConfirmed: event.target.checked })} /><span>我已在现场核对并确认这个库位</span></label></div>
      <div className="completion-checklist"><h4>完成条件</h4>{completion?.blockers.length === 0 ? <p className="ready-text"><CheckCircle size={17} />SN、取件码和库位资料完整</p> : completion?.blockers.map((blocker) => <p key={blocker}>{blocker}</p>)}</div>
      {active.errors.length > 0 && <div className="detail-section"><h4>库存阻塞</h4>{active.errors.map((error) => <p className="danger-text" key={error.code}>{error.code} · {error.message}</p>)}</div>}
    </>}<button onClick={confirmBatch} className={`locked-action ${batchReady ? 'ready' : ''}`} disabled={!batchReady||confirming}>{confirming?'写入并复核中…':batchReady?'确认整单备货并写入 UAT':active?.errors.length?'库存校验仍阻塞':'完成全部 SN 与库位确认'}</button></aside>
    {mapOpen&&active&&<div className="map-modal" role="dialog" aria-modal="true"><div className="map-modal-card"><header><div><h3>选择备货来源库位</h3><p>只高亮当前料号且数量足够的库位；点击后仍需现场确认。</p></div><button onClick={()=>setMapOpen(false)} aria-label="关闭"><X size={22}/></button></header><WarehouseMatrix locations={locations} selectableSku={active.proposedPreparedRow?.sku} requiredQty={active.proposedPreparedRow?.qty??1} selectedLocation={activeDraft.location} onSelect={(location)=>{updateDraft(selected,{location,locationConfirmed:false});setMapOpen(false);}}/></div></div>}
  </div>;
}
