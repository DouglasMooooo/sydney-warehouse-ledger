'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowRight, CheckCircle, FileArrowUp, MapPin, Trash, WarningCircle, X } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { ControlledBatchTransferInput, ControlledBatchTransferPreview } from '../../../src/application/controlledLedgerOperation';
import { WarehouseMatrix, type MatrixLocation } from '../warehouse-layout/warehouse-matrix';

type TransferWorkflow = ControlledBatchTransferInput['workflow'];
type Stage = 'idle' | 'previewing' | 'ready' | 'writing' | 'done' | 'error';

export function BatchTransferWorkspace({ workflow, businessDate, locations }: {
  workflow: TransferWorkflow;
  businessDate: string;
  locations: MatrixLocation[];
}) {
  const [date, setDate] = useState(businessDate);
  const [snText, setSnText] = useState('');
  const [fileName, setFileName] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const [preview, setPreview] = useState<ControlledBatchTransferPreview>();
  const [stage, setStage] = useState<Stage>('idle');
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const parsed = useMemo(() => parseSnText(snText), [snText]);
  const batchLimit = workflow === 'REPAIR_COMPLETE' ? 50 : 100;
  const overLimit = parsed.sns.length > batchLimit;
  const label = workflow === 'MOVE' ? '批量移库' : '批量维修完成';
  const helper = workflow === 'MOVE'
    ? '上传或粘贴 SN，系统逐台读取当前库位与库存属性，再统一移动到所选目标库位。'
    : '上传或粘贴待修 SN，系统逐台校验 REPAIR 状态，把第 8 位转为 R 后入维修良品库位。';

  function resetPreview() {
    setPreview(undefined);
    setStage('idle');
    setMessage('');
  }

  async function loadFile(file?: File) {
    if (!file) return;
    if (!/\.(txt|csv)$/i.test(file.name)) {
      setStage('error');
      setMessage('SN 文件请使用 .txt 或 .csv；也可以直接从 Excel 复制后粘贴。');
      return;
    }
    setSnText(await file.text());
    setFileName(file.name);
    setPreview(undefined);
    setStage('idle');
    setMessage('');
  }

  function clearFile() {
    setSnText('');
    setFileName('');
    resetPreview();
    if (fileInput.current) fileInput.current.value = '';
  }

  async function requestPreview() {
    if (!parsed.sns.length || parsed.duplicates.length || overLimit || !toLocation) return;
    setStage('previewing'); setMessage(''); setPreview(undefined);
    const input: ControlledBatchTransferInput = { workflow, date, toLocation, sns: parsed.sns };
    try {
      const response = await fetch('/api/warehouse/operations/batch/preview', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(input) });
      const result = await response.json() as ApiResponse<ControlledBatchTransferPreview>;
      if (!result.ok) throw new Error(`${result.error.code} · ${result.error.message}`);
      setPreview(result.data); setStage('ready');
    } catch (error) {
      setStage('error'); setMessage(error instanceof Error ? error.message : '批量预览失败');
    }
  }

  async function confirmWrite() {
    if (!preview) return;
    setStage('writing'); setMessage('');
    const input: ControlledBatchTransferInput = { workflow, date, toLocation, sns: parsed.sns, commandId: preview.commandId };
    try {
      const response = await fetch('/api/warehouse/operations/batch/execute', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(input) });
      const result = await response.json() as ApiResponse<{ rows: number[] }>;
      if (!result.ok) throw new Error(`${result.error.code} · ${result.error.message}`);
      setStage('done'); setMessage(`已写入并复核 ${result.data.rows.length} 条流水。`);
    } catch (error) {
      setStage('error'); setMessage(error instanceof Error ? error.message : '批量写入失败');
    }
  }

  return <section className="batch-transfer">
    <header className="batch-transfer-header">
      <div><span className="workflow-kicker">WAREHOUSE FLOW</span><h3>{label}</h3><p>{helper}</p></div>
      <div className="batch-flow-steps"><b>1</b><span>导入 SN</span><i/><b>2</b><span>选择目标库位</span><i/><b>3</b><span>预览并确认</span></div>
    </header>

    <div className="batch-transfer-grid">
      <div className="batch-input-card">
        <div className="batch-card-title"><span>01</span><div><h4>导入机器 SN</h4><p>一行一个，支持从 Excel 整列粘贴。</p></div></div>
        <label>业务日期<input type="date" value={date} onChange={(event)=>{setDate(event.target.value);resetPreview();}} /></label>
        <input ref={fileInput} className="sr-only" type="file" accept=".txt,.csv,text/plain,text/csv" onChange={(event)=>void loadFile(event.target.files?.[0])}/>
        <button type="button" className="batch-file-button" onClick={()=>fileInput.current?.click()}><FileArrowUp size={20}/><span><strong>{fileName || '上传 SN 文件'}</strong><small>.txt / .csv，或直接在下方粘贴</small></span></button>
        {fileName&&<button type="button" className="batch-clear-file" onClick={clearFile}><Trash size={15}/>删除已上传文件</button>}
        <label>SN 列表<textarea value={snText} onChange={(event)=>{setSnText(event.target.value);resetPreview();}} placeholder={'60HD103064PM133\n60KB103061NB141\n60E5M48R63QF125'} /></label>
        <div className={`batch-count${parsed.duplicates.length||overLimit?' error':''}`}><strong>{parsed.sns.length}</strong><span>台待处理 · 本流程上限 {batchLimit} 台</span>{parsed.duplicates.length>0&&<em>{parsed.duplicates.length} 个重复 SN，删除重复项后才能继续</em>}{overLimit&&<em>超出本批次上限，请拆分后提交</em>}</div>
      </div>

      <div className="batch-target-card">
        <div className="batch-card-title"><span>02</span><div><h4>选择目标库位</h4><p>从仓库现场图点击，避免手输库位代码。</p></div></div>
        <button type="button" className={`visual-location-trigger${toLocation?' selected':''}`} onClick={()=>setMapOpen(true)}>
          <MapPin size={24}/><span><small>本批次目标库位</small><strong>{toLocation || '打开仓库图选择'}</strong></span><ArrowRight size={18}/>
        </button>
        <div className="target-policy"><span>系统会逐台检查</span><b>{workflow==='MOVE'?'来源库位不同 · SN 在库 · 属性保持':'当前为待修 · 来源 REPAIR · SN 转维修良品'}</b></div>
      </div>
    </div>

    <div className="batch-preview-card">
      <div className="batch-card-title"><span>03</span><div><h4>确认预览</h4><p>写入前逐台显示来源、目标和库存属性变化。</p></div></div>
      {!preview ? <div className="batch-preview-empty"><ArrowRight size={26}/><strong>准备好后生成批量预览</strong><span>不会修改历史行；确认时只新增流水并执行写后复核。</span></div> : <>
        <div className="batch-preview-summary"><strong>{preview.items.length} 台</strong><span>目标 {preview.toLocation}</span><span>{preview.totalRows} 条新增流水</span><small>操作编号 {preview.commandId}</small></div>
        <div className="batch-preview-table-wrap"><table className="batch-preview-table"><thead><tr><th>SN</th><th>来源</th><th>库存属性</th><th>目标</th><th>结果</th></tr></thead><tbody>{preview.items.map((item)=><tr key={item.sn}><td><b>{item.sn}</b>{workflow==='REPAIR_COMPLETE'&&<small>→ {String(item.preview.rows.at(-1)?.sn ?? '')}</small>}</td><td>{item.preview.before?.location}</td><td>{item.preview.before?.stockCondition} → {item.preview.after?.stockCondition}</td><td>{item.preview.after?.location}</td><td><span className="row-status ok">可执行</span></td></tr>)}</tbody></table></div>
      </>}
      {stage==='error'&&<div className="inline-alert danger"><WarningCircle size={18}/>{message}</div>}
      {stage==='done'&&<div className="inline-alert success"><CheckCircle size={18}/>{message}</div>}
      <div className="batch-action-bar">
        {!preview?<button type="button" className="execute-button" disabled={!parsed.sns.length||Boolean(parsed.duplicates.length)||overLimit||!toLocation||stage==='previewing'} onClick={requestPreview}>{stage==='previewing'?'正在逐台读取库存…':`生成${label}预览`}<ArrowRight size={18}/></button>
          :<button type="button" className="confirm-write-button" disabled={stage==='writing'||stage==='done'} onClick={confirmWrite}>{stage==='writing'?'写入并复核中…':stage==='done'?'本批次已完成':`确认 ${preview.items.length} 台并写入 UAT`}</button>}
      </div>
    </div>

    {mapOpen&&<div className="map-modal" role="dialog" aria-modal="true"><div className="map-modal-card"><header><div><h3>选择{label}目标库位</h3><p>点击任一已登记库位；最终写入前仍会逐台校验。</p></div><button onClick={()=>setMapOpen(false)} aria-label="关闭"><X size={22}/></button></header><WarehouseMatrix locations={locations} selectionMode="target" selectedLocation={toLocation} onSelect={(location)=>{setToLocation(location);setMapOpen(false);resetPreview();}}/></div></div>}
  </section>;
}

function parseSnText(value: string): { sns: string[]; duplicates: string[] } {
  const raw = value.split(/\r?\n/).map((line)=>line.split(/[\t,;]/)[0]?.trim().toUpperCase().replace(/\s+/g, '') ?? '').filter(Boolean);
  const seen = new Set<string>();
  const duplicates = [...new Set(raw.filter((sn)=>seen.has(sn) || (seen.add(sn), false)))];
  return { sns: [...new Set(raw)], duplicates };
}
