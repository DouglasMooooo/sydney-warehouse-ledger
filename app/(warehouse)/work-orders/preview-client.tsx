'use client';

import Link from 'next/link';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle, FileXls, MagnifyingGlass, MapPin, Printer, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { PreparedBatchConfirmResult, PreparedPrintLabel } from '../../../src/application/confirmPreparedWorkOrder';
import { evaluatePreparedCompletion } from '../../../src/application/preparedCompletion';
import type { MultiFileWorkOrderPreview, WorkOrderBatchPreview, WorkOrderLinePreview } from '../../../src/application/workOrderBatchPreview';
import { ControlledActionPanel } from '../controlled-action-panel';
import { WarehouseMatrix, type MatrixLocation } from '../warehouse-layout/warehouse-matrix';

interface LineDraft { snText: string; location: string; locationConfirmed: boolean }
interface FlatLine { key: string; documentIndex: number; lineIndex: number; document: WorkOrderBatchPreview; item: WorkOrderLinePreview }

export function WorkOrderPreviewClient({ initialBusinessDate, locations }: { initialBusinessDate: string; locations: MatrixLocation[] }) {
  const [businessDate, setBusinessDate] = useState(initialBusinessDate);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<MultiFileWorkOrderPreview>();
  const [systemError, setSystemError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string>();
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [mapOpen, setMapOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<string>();
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);

  const rows = useMemo<FlatLine[]>(() => preview?.documents.flatMap((document, documentIndex) =>
    document.lines.map((item, lineIndex) => ({ key:`${documentIndex}:${lineIndex}`,documentIndex,lineIndex,document,item }))) ?? [], [preview]);
  const active = rows.find((row)=>row.key===selectedKey) ?? rows[0];
  const activeDraft = active ? drafts[active.key] ?? blankDraft() : blankDraft();
  const labels = useMemo(() => buildPreviewLabels(preview), [preview]);

  async function submit(event: FormEvent) {
    event.preventDefault(); if (!files.length) return;
    setLoading(true); setSystemError(undefined); setPreview(undefined); setDrafts({}); setConfirmResult(undefined);
    try {
      const form = new FormData(); form.set('businessDate', businessDate); files.forEach((file)=>form.append('files',file));
      const response = await fetch('/api/warehouse/work-orders/preview', { method:'POST', body:form });
      const payload = await response.json() as ApiResponse<MultiFileWorkOrderPreview>;
      if(!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setPreview(payload.data); setSelectedKey(payload.data.documents[0]?.lines[0]?'0:0':undefined);
      setSelectedLabels(new Set(buildPreviewLabels(payload.data).map(item=>item.pickupCode)));
    } catch(error){setSystemError(error instanceof Error?error.message:'系统读取失败');} finally{setLoading(false);}
  }

  function updateDraft(key:string,patch:Partial<LineDraft>){setDrafts(current=>({...current,[key]:{...blankDraft(),...current[key],...patch}}));}

  function removeFile(index:number){
    setFiles(current=>current.filter((_,itemIndex)=>itemIndex!==index));
    setDrafts({}); setSelectedKey(undefined); setConfirmResult(undefined);
    setPreview(current=>{if(!current)return current;const documents=current.documents.filter((_,itemIndex)=>itemIndex!==index);const next={...current,documents,summary:summarizeDocuments(documents)};setSelectedLabels(new Set(buildPreviewLabels(next).map(item=>item.pickupCode)));return next;});
    if(fileInput.current) fileInput.current.value='';
  }

  async function confirmBatch(){
    if(!preview||!batchReady) return; setConfirming(true); setSystemError(undefined); setConfirmResult(undefined);
    try{
      const workOrders=preview.documents.map((document,documentIndex)=>({sh:document.sh!,pickupCode:document.lines[0]?.preview.pickupCode?.value,sourceFileName:document.sourceFileName,
        lines:document.lines.map((item,lineIndex)=>{const row=item.preview.proposedPreparedRow!;const draft=drafts[`${documentIndex}:${lineIndex}`]!;return{
          sku:row.sku,model:row.model,erpWarehouse:row.erpWarehouse,location:draft.location,locationConfirmed:draft.locationConfirmed,
          sns:splitSns(draft.snText),sourceFileName:document.sourceFileName,sourceRow:item.sourceRow,
        };})}));
      const response=await fetch('/api/warehouse/work-orders/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({businessDate,workOrders,commandId:preview.commandId})});
      const payload=await response.json() as ApiResponse<PreparedBatchConfirmResult>;
      if(!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setConfirmResult(`已确认 ${payload.data.workOrders.length} 张工单，写入并复核 ${payload.data.rows.length} 行。`);
    }catch(error){setSystemError(error instanceof Error?error.message:'批量备货写入失败');}finally{setConfirming(false);}
  }

  const completionFor=(row:FlatLine)=>{const draft=drafts[row.key]??blankDraft();const proposed=row.item.preview.proposedPreparedRow;return evaluatePreparedCompletion({expectedQty:proposed?.qty??0,snText:draft.snText,confirmedLocation:draft.location,locationConfirmed:draft.locationConfirmed,pickupCode:row.item.preview.pickupCode?.value});};
  const completedDrafts=rows.filter(row=>row.item.preview.errors.length===0&&completionFor(row).ready).length;
  const errorCount=preview?.summary.errors??0;
  const batchReady=Boolean(rows.length&&completedDrafts===rows.length&&errorCount===0&&preview?.documents.every(item=>item.sh));
  const activeCompletion=active?completionFor(active):undefined;
  const activeRow=active?.item.preview.proposedPreparedRow;
  const fileLabel=files.length?`${files.length} 个工单文件`:'尚未选择工单';

  return <><div className="operations-console">
    <aside className="console-rail"><ControlledActionPanel action="备货" workflow="工单备货" effect="不扣库存" />
      <form onSubmit={submit} className="import-panel"><label>悉尼业务日<input type="date" value={businessDate} onChange={event=>setBusinessDate(event.target.value)} required /></label>
        <input ref={fileInput} className="sr-only" type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>setFiles([...event.target.files??[]])}/>
        <button className="file-picker" type="button" onClick={()=>fileInput.current?.click()}><FileXls size={21}/><span>{fileLabel}</span></button>
        {files.length>0&&<div className="selected-files">{files.map((file,index)=><span key={`${file.name}-${file.size}-${index}`}>{file.name}<button type="button" onClick={()=>removeFile(index)} aria-label={`删除 ${file.name}`}><X size={13}/></button></span>)}</div>}
        <button className="outline-button" disabled={loading||!files.length}><UploadSimple size={18}/>{loading?'逐份解析与对账…':'批量导入工单'}</button>
      </form><Link className="secondary-workflow" href="/returns"><span><strong>坏机接收</strong><small>SN 自动识别料号，默认 REPAIR-01</small></span><ArrowRight size={18}/></Link>
    </aside>
    <section className="console-main"><div className="job-summary"><div><h3>{preview?`批量工单 · ${preview.summary.workOrders} 张`:'库存操作台 · 等待导入工单'}</h3><p>{fileLabel}</p></div><span>{preview?'逐单对账':'未开始'}</span></div>
      <div className="job-stats"><span>文件 <b>{preview?.summary.files??0}</b></span><span>工单 <b>{preview?.summary.workOrders??0}</b></span><span>Replacement 行 <b>{rows.length}</b></span><span>资料完整 <b>{completedDrafts}</b></span><span>阻塞 <b>{errorCount}</b></span></div>
      {labels.length>0&&<div className="work-order-label-bar"><div className="label-bar-copy"><span>下一步</span><strong>先打印取货标签，再去现场找货</strong><small>标签按工单生成，打印不会写入台账。</small></div><div className="label-bar-selector"><LabelSelector labels={labels} selected={selectedLabels} setSelected={setSelectedLabels}/></div><button type="button" onClick={()=>window.print()} className="print-label-button" disabled={!selectedLabels.size}><Printer size={19}/>打印已选 {selectedLabels.size} 张</button></div>}
      <div className="table-tools"><div><MagnifyingGlass size={17}/>{preview?'不同工单保持独立，不跨单重排':'等待导入工单'}</div><span>Pickup：确认时逐单生成</span><span>库位与 SN：人工确认</span></div>
      {systemError&&<div className="inline-alert danger"><WarningCircle size={19}/>{systemError}</div>}{confirmResult&&<div className="inline-alert success"><CheckCircle size={19}/>{confirmResult}</div>}
      {!preview&&!systemError&&<div className="console-empty"><UploadSimple size={36}/><strong>可一次选择多份 ERP 工单</strong><span>每份文件独立读取 Replacement Information、ERP 仓库和原始行，不跨工单归并。</span></div>}
      {preview&&<>{preview.documents.map((document,index)=>document.errors.length?<div className="blocked-file" key={`blocked-${index}`}><div><strong>{document.sourceFileName??`文件 ${index+1}`} · 无法继续</strong>{document.errors.map((error,errorIndex)=><p key={`${error.code}-${errorIndex}`}>{error.code}：{error.message}</p>)}</div><button type="button" onClick={()=>removeFile(index)}><X size={15}/>删除文件</button></div>:null)}<div className="console-table-wrap"><table className="console-table"><thead><tr><th>SH / 文件</th><th>SKU / 机型</th><th>数量</th><th>ERP 仓库</th><th>库存属性</th><th>建议库位</th><th>人工资料</th><th>状态</th></tr></thead><tbody>{rows.map(row=>{const proposed=row.item.preview.proposedPreparedRow;const ready=completionFor(row).ready;const blocked=row.item.preview.errors.length>0;return <tr className={(active?.key===row.key)?'selected':''} onClick={()=>setSelectedKey(row.key)} key={row.key}><td><strong>{row.document.sh??'—'}</strong><small>{row.document.sourceFileName??'—'} · 原行 {row.item.sourceRow??'—'}</small></td><td>{proposed?.sku??row.item.preview.extracted.replacementSku??'—'}<small>{proposed?.model??'—'}</small></td><td>{proposed?.qty??row.item.preview.extracted.qty??'—'}</td><td>{proposed?.erpWarehouse??row.item.preview.extracted.erpWarehouse??'—'}</td><td><span className="condition-chip">{proposed?.stockCondition??'—'}</span></td><td>{row.item.preview.recommendation?.location??'—'}<small>{row.item.preview.recommendation?.container??''}</small></td><td>{ready?'SN + 库位已确认':'等待填写'}</td><td><span className={`row-status ${blocked?'blocked':ready?'ok':'pending'}`}>{blocked?row.item.preview.errors.map(item=>item.code).join('、'):ready?'可完成':'待确认'}</span></td></tr>;})}</tbody></table></div></>}
    </section>
    <aside className="detail-panel prepared-detail"><h3>现场找货与确认</h3>{!active?<div className="detail-empty">导入工单并打印标签后，从清单选择一行开始扫码。</div>:<><div className="detail-section detail-section-first"><h4>扫描 SN 并确认来源</h4></div><dl><dt>SH</dt><dd>{active.document.sh??'—'}</dd><dt>SKU</dt><dd>{activeRow?.sku??'—'}</dd><dt>ERP 仓库</dt><dd>{activeRow?.erpWarehouse??'—'}</dd><dt>库存属性</dt><dd>{activeRow?.stockCondition??'—'}</dd><dt>数量</dt><dd>{activeRow?.qty??'—'}</dd><dt>Pickup Code</dt><dd>{active.item.preview.pickupCode?.value??'—'}</dd><dt>系统建议库位</dt><dd>{active.item.preview.recommendation?.location??'无可用库位'}</dd></dl>
        <div className="detail-section completion-fields"><label>机器 SN（每台一行）<textarea value={activeDraft.snText} onChange={event=>updateDraft(active.key,{snText:event.target.value})} placeholder={`需要填写 ${activeRow?.qty??0} 个 SN`}/></label><label>最终来源库位<input value={activeDraft.location} readOnly placeholder="请从仓库图选择"/></label><button type="button" className="map-select-button" onClick={()=>setMapOpen(true)}><MapPin size={17}/>{activeDraft.location?`已选择 ${activeDraft.location}`:'打开仓库图选择可用库位'}</button><label className="confirm-location"><input type="checkbox" checked={activeDraft.locationConfirmed} onChange={event=>updateDraft(active.key,{locationConfirmed:event.target.checked})}/><span>我已在现场核对库位、容器和库存属性</span></label></div>
        <div className="completion-checklist"><h4>完成条件</h4>{activeCompletion?.blockers.length===0?<p className="ready-text"><CheckCircle size={17}/>SN、ERP 仓库、库存属性和库位完整</p>:activeCompletion?.blockers.map(blocker=><p key={blocker}>{blocker}</p>)}</div></>}
      <button onClick={confirmBatch} className={`locked-action ${batchReady?'ready':''}`} disabled={!batchReady||confirming}>{confirming?'逐单写入并复核中…':batchReady?'确认全部 SN 与库位并写入':'完成全部 SN 与库位确认'}</button>
    </aside>
    {mapOpen&&active&&<div className="map-modal" role="dialog" aria-modal="true"><div className="map-modal-card"><header><div><h3>选择备货来源库位</h3><p>匹配 SKU + 库存属性；FLEX-01 有足量库存时优先。</p></div><button onClick={()=>setMapOpen(false)} aria-label="关闭"><X size={22}/></button></header><WarehouseMatrix locations={locations} selectableSku={activeRow?.sku} requiredQty={activeRow?.qty??1} selectedLocation={activeDraft.location} onSelect={location=>{updateDraft(active.key,{location,locationConfirmed:false});setMapOpen(false);}}/></div></div>}
  </div><PrintLabels labels={labels.filter(label=>selectedLabels.has(label.pickupCode))}/></>;
}

function LabelSelector({labels,selected,setSelected}:{labels:PreparedPrintLabel[];selected:Set<string>;setSelected:(value:Set<string>)=>void}){return <div className="label-selector"><div className="label-select-actions"><button type="button" onClick={()=>setSelected(new Set(labels.map(item=>item.pickupCode)))}>全选</button><button type="button" onClick={()=>setSelected(new Set())}>清空</button></div>{labels.map(label=><label key={label.pickupCode}><input type="checkbox" checked={selected.has(label.pickupCode)} onChange={()=>{const next=new Set(selected);next.has(label.pickupCode)?next.delete(label.pickupCode):next.add(label.pickupCode);setSelected(next);}}/><span><strong>{label.pickupCode}</strong><small>{label.sh} · {label.lines.reduce((sum,line)=>sum+line.qty,0)} 台</small></span></label>)}</div>;}
function PrintLabels({labels}:{labels:PreparedPrintLabel[]}){return <section className="print-labels">{labels.map(label=><article className="print-label" key={label.pickupCode}><header><div><span>SH</span><strong>{label.sh}</strong></div><div><span>PICKUP CODE</span><strong>{label.pickupCode}</strong></div></header><table><thead><tr><th>SKU / Model</th><th>ERP 仓库</th><th>库存属性</th><th>建议库位 / 容器</th><th>Qty</th></tr></thead><tbody>{label.lines.map((line,index)=><tr key={`${line.sku}-${line.erpWarehouse}-${index}`}><td><b>{line.sku}</b><small>{line.model}</small></td><td>{line.erpWarehouse}</td><td>{line.stockCondition}</td><td>{line.suggestedLocation}<small>{line.containerCode??''}</small></td><td className="label-qty">{line.qty}</td></tr>)}</tbody></table><footer>Sydney Warehouse · 备货标签 · 库存以主表为准</footer></article>)}</section>;}
function blankDraft():LineDraft{return{snText:'',location:'',locationConfirmed:false};}
function splitSns(value:string){return value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean);}
function summarizeDocuments(documents:WorkOrderBatchPreview[]){return{files:documents.length,workOrders:documents.filter(item=>item.sh).length,lines:documents.reduce((sum,item)=>sum+item.lines.length,0),errors:documents.reduce((sum,item)=>sum+item.errors.length,0)};}
function buildPreviewLabels(preview?:MultiFileWorkOrderPreview):PreparedPrintLabel[]{return preview?.documents.flatMap(document=>{if(!document.sh||document.errors.length||!document.lines.length)return[];const pickupCode=document.lines[0]?.preview.pickupCode?.value;if(!pickupCode)return[];const groups=new Map<string,PreparedPrintLabel['lines'][number]>();for(const item of document.lines){const row=item.preview.proposedPreparedRow;const recommendation=item.preview.recommendation;if(!row||!recommendation)continue;const key=`${row.sku}\u0000${row.model}\u0000${row.erpWarehouse}`;const current=groups.get(key);if(current)current.qty+=row.qty;else groups.set(key,{sku:row.sku,model:row.model,erpWarehouse:row.erpWarehouse,stockCondition:row.stockCondition as '新机'|'维修良品',qty:row.qty,suggestedLocation:recommendation.location,...(recommendation.container?{containerCode:recommendation.container}:{})});}return groups.size?[{sh:document.sh,pickupCode,lines:[...groups.values()]}]:[];})??[];}
