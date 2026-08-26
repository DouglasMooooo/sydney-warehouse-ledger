'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, ArrowsLeftRight, CheckCircle, ClipboardText, Package, ShieldWarning, WarningCircle, Wrench } from '@phosphor-icons/react';
import { ACTION_RULES, ADJUSTMENT_REASONS, type InventoryWorkflow, type InventoryWorkflowInput, type InventoryWorkflowPreview } from '../../../src/application/inventoryActionEngine';
import { STOCK_CONDITIONS } from '../../../src/config/controlledValues';
import type { ApiResponse } from '../../../src/application/apiResponse';
import { BatchTransferWorkspace } from './batch-transfer-workspace';
import type { MatrixLocation } from '../warehouse-layout/warehouse-matrix';

const DAILY: InventoryWorkflow[] = ['OUTBOUND', 'INBOUND', 'MOVE', 'REPAIR_COMPLETE'];
const ADJUSTMENTS: InventoryWorkflow[] = ['ADJUST_INCREASE', 'ADJUST_DECREASE'];

export function OperationsClient({ businessDate, canAdjust, locations }: { businessDate: string; canAdjust: boolean; locations: MatrixLocation[] }) {
  const [workflow, setWorkflow] = useState<InventoryWorkflow>('MOVE');
  const [preview, setPreview] = useState<InventoryWorkflowPreview>();
  const [pending, setPending] = useState<InventoryWorkflowInput>();
  const [state, setState] = useState<'idle'|'previewing'|'ready'|'writing'|'done'|'error'>('idle');
  const [message, setMessage] = useState('');
  const [otherReason, setOtherReason] = useState(false);
  const rule = ACTION_RULES[workflow];

  function choose(next: InventoryWorkflow) {
    setWorkflow(next); setPreview(undefined); setPending(undefined); setState('idle'); setMessage(''); setOtherReason(false);
  }

  async function requestPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('previewing'); setMessage(''); setPreview(undefined);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;
    const payload: InventoryWorkflowInput = { ...data, workflow, ...(data.qty ? { qty: Number(data.qty) } : {}) };
    try {
      const response = await fetch('/api/warehouse/operations/preview', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload) });
      const result = await response.json() as ApiResponse<InventoryWorkflowPreview>;
      if (!result.ok) throw new Error(`${result.error.code} · ${result.error.message}`);
      setPreview(result.data); setPending(payload); setState('ready');
    } catch (reason) { setState('error'); setMessage(reason instanceof Error ? reason.message : '预览失败'); }
  }

  async function confirmWrite() {
    if (!pending || !preview) return;
    setState('writing'); setMessage('');
    try {
      const response = await fetch('/api/warehouse/operations/execute', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(pending) });
      const result = await response.json() as ApiResponse<{rows:number[]}>;
      if (!result.ok) throw new Error(`${result.error.code} · ${result.error.message}`);
      setState('done'); setMessage(`已写入并复核第 ${result.data.rows.join(', ')} 行`);
    } catch (reason) { setState('error'); setMessage(reason instanceof Error ? reason.message : '写入失败'); }
  }

  const sidebar = <OperationsSidebar workflow={workflow} canAdjust={canAdjust} choose={choose}/>;
  if (workflow === 'MOVE' || workflow === 'REPAIR_COMPLETE') {
    return <div className="workflow-workbench batch-mode">{sidebar}<BatchTransferWorkspace key={workflow} workflow={workflow} businessDate={businessDate} locations={locations}/></div>;
  }

  return <div className="workflow-workbench">
    {sidebar}

    <main className="workflow-form-area">
      <header className="workflow-title"><div><span className="workflow-kicker">BUSINESS WORKFLOW</span><h3>{rule.label}</h3><p>{workflowDescription(workflow)}</p></div><div className="system-action"><span>系统库存动作</span><strong>{rule.ledgerAction}</strong><small>{effectLabel(rule.inventoryEffect)}</small></div></header>
      <form key={workflow} className="workflow-form" onSubmit={requestPreview}>
        <label>业务日期<input name="date" type="date" defaultValue={businessDate} required /></label>
        <WorkflowFields workflow={workflow} businessDate={businessDate} otherReason={otherReason} setOtherReason={setOtherReason} />
        <div className="write-warning"><ClipboardText size={18}/><span>先读取并校验当前库存，再生成确认预览。只有再次确认后才新增流水，历史记录不会被修改。</span></div>
        <button className="execute-button" disabled={state==='previewing'||state==='writing'}><ArrowRight size={19}/>{state==='previewing'?'正在读取并校验…':`生成${rule.label}确认预览`}</button>
      </form>
      {state==='error' && <p className="write-result error"><WarningCircle size={18}/>{message}</p>}
      {state==='done' && <p className="write-result ok"><CheckCircle size={18}/>{message}</p>}
    </main>

    <aside className="workflow-preview-panel">
      <h3>确认预览</h3>
      {!preview ? <div className="preview-placeholder"><ArrowsLeftRight size={32}/><strong>尚未生成预览</strong><span>填写左侧业务字段后，系统会展示 Before → Transaction → After。</span></div> : <>
        <div className="preview-effect"><span>库存影响</span><strong>{effectLabel(preview.inventoryEffect)}</strong></div>
        {preview.before && <PreviewState title="Before" value={preview.before} />}
        <div className="preview-transaction"><span>Transaction</span><strong>{preview.label}</strong><small>Ledger · {preview.ledgerAction}</small><small>{preview.rows.length} 条新增流水</small></div>
        {preview.after && <PreviewState title="After" value={preview.after} />}
        {!preview.before && !preview.after && <div className="preview-row-list">{preview.rows.map((row,index)=><div key={index}><b>{String(row.sku ?? 'UNKNOWN')}</b><span>{row.sn ? String(row.sn) : `Qty ${String(row.qty ?? '')}`}</span><small>{row.fromLocation ? `${String(row.fromLocation)} → ` : ''}{String(row.toLocation ?? '出库')}</small></div>)}</div>}
        {preview.warnings.map((warning)=><div className="inline-alert warning" key={warning}><WarningCircle size={17}/>{warning}</div>)}
        <button type="button" className="confirm-write-button" onClick={confirmWrite} disabled={state==='writing'||state==='done'}>{state==='writing'?'写入并复核中…':state==='done'?'本次操作已完成':`确认${preview.label}并写入 UAT`}</button>
      </>}
    </aside>
  </div>;
}

function OperationsSidebar({workflow,canAdjust,choose}:{workflow:InventoryWorkflow;canAdjust:boolean;choose:(value:InventoryWorkflow)=>void}) {
  return <aside className="workflow-sidebar">
    <WorkflowLink href="/work-orders" label="工单备货" detail="导入工单，系统生成备货动作" />
    <WorkflowLink href="/returns" label="坏机接收" detail="批量 SN，默认进入 REPAIR-01" />
    <WorkflowGroup title="日常作业" workflows={DAILY} selected={workflow} onSelect={choose} />
    <WorkflowGroup title="库存修正" workflows={ADJUSTMENTS} selected={workflow} onSelect={choose} locked={!canAdjust} />
    <div className="workflow-group"><h3>管理员</h3><button type="button" className={workflow === 'OPENING_BALANCE' ? 'active admin' : 'admin'} disabled={!canAdjust} onClick={() => choose('OPENING_BALANCE')}><ShieldWarning size={17}/><span>期初库存<small>{canAdjust ? '初始化专用' : '需要管理员权限'}</small></span></button></div>
  </aside>;
}

function WorkflowGroup({title,workflows,selected,onSelect,locked=false}:{title:string;workflows:InventoryWorkflow[];selected:InventoryWorkflow;onSelect:(value:InventoryWorkflow)=>void;locked?:boolean}) {
  return <div className="workflow-group"><h3>{title}</h3>{workflows.map((item)=><button type="button" key={item} className={selected===item?'active':''} disabled={locked} onClick={()=>onSelect(item)}><Package size={17}/><span>{ACTION_RULES[item].label}<small>{locked?'需要管理员权限':effectLabel(ACTION_RULES[item].inventoryEffect)}</small></span></button>)}</div>;
}

function WorkflowLink({href,label,detail}:{href:string;label:string;detail:string}) { return <Link className="workflow-link" href={href}><Wrench size={17}/><span>{label}<small>{detail}</small></span><ArrowRight size={15}/></Link>; }

function WorkflowFields({workflow,businessDate,otherReason,setOtherReason}:{workflow:InventoryWorkflow;businessDate:string;otherReason:boolean;setOtherReason:(value:boolean)=>void}) {
  if (workflow==='OUTBOUND') return <><label>Pickup Code / SH<input name="reference" placeholder="SYD-00000 或 SH-..." required /></label><label>机器 SN<input name="sn" required /></label><label>实际出库日期<input name="outboundDate" type="date" defaultValue={businessDate} required /></label><p className="field-note">SKU、来源库位、容器、库存属性由备货流水自动加载。</p></>;
  if (workflow==='MOVE') return <><label>机器 SN<input name="sn" placeholder="扫描或输入 SN" required /></label><label>目标库位<input name="toLocation" placeholder="例如 FLEX-01" required /></label><p className="field-note">来源库位、SKU、容器和库存属性由当前库存自动读取，库存属性保持不变。</p></>;
  if (workflow==='REPAIR_COMPLETE') return <><label>机器 SN<input name="sn" required /></label><label>维修良品目标库位<input name="toLocation" placeholder="例如 R1-2-3-L" required /></label><p className="field-note">系统只接受当前为“待修”的 SN，并关闭待修状态后建立维修良品状态。</p></>;
  if (workflow==='INBOUND') return <><label>料号<input name="sku" required /></label><label>机器 SN<input name="sn" required /></label><label>目标库位<input name="toLocation" required /></label><label>库存属性<select name="stockCondition" required>{STOCK_CONDITIONS.map(item=><option key={item}>{item}</option>)}</select></label><label>容器码（可选）<input name="containerCode" /></label><label className="wide">备注（可选）<input name="remark" /></label></>;
  if (workflow==='ADJUST_INCREASE'||workflow==='ADJUST_DECREASE') return <><label>料号<input name="sku" required /></label><label>数量<input name="qty" type="number" min="1" step="1" required /></label><label>库存属性<select name="stockCondition" required>{STOCK_CONDITIONS.map(item=><option key={item}>{item}</option>)}</select></label><label>{workflow==='ADJUST_INCREASE'?'目标库位':'来源库位'}<input name={workflow==='ADJUST_INCREASE'?'toLocation':'fromLocation'} required /></label><label>SN（非序列化物料可留空）<input name="sn" /></label><label>Adjustment Reason<select name="adjustmentReason" required onChange={(event)=>setOtherReason(event.target.value==='Other')}><option value="">请选择</option>{ADJUSTMENT_REASONS.map(item=><option key={item}>{item}</option>)}</select></label><label className="wide">备注{otherReason?'（Other 必填）':'（可选）'}<input name="remark" required={otherReason} /></label></>;
  return <><div className="admin-warning wide"><ShieldWarning size={19}/><span><strong>管理员初始化操作</strong>不得用于纠正正常库存差异；必须保留来源或导入批次。</span></div><label>料号<input name="sku" required /></label><label>数量<input name="qty" type="number" min="1" step="1" required /></label><label>目标库位<input name="toLocation" required /></label><label>库存属性<select name="stockCondition" required>{STOCK_CONDITIONS.map(item=><option key={item}>{item}</option>)}</select></label><label>SN（可选）<input name="sn" /></label><label>Source / Import Reference<input name="importReference" required /></label></>;
}

function PreviewState({title,value}:{title:string;value:{sku:string;location:string;qty:number;stockCondition:string}}) { return <div className="preview-state"><span>{title}</span><b>{value.sku}</b><small>{value.location}</small><small>{value.stockCondition} · Qty {value.qty}</small></div>; }
function effectLabel(effect:string){return effect==='none'?'不改变库存':effect==='increase'?'增加库存':effect==='decrease'?'减少库存':'库位/状态转换，总量不变';}
function workflowDescription(workflow:InventoryWorkflow){const descriptions:Partial<Record<InventoryWorkflow,string>>={OUTBOUND:'从已备货记录进入，确认 SN 与实际出库日期。',INBOUND:'验证产品和目标库位后接收入库。',MOVE:'扫描 SN，系统自动读取当前来源，只选择目标库位。',REPAIR_COMPLETE:'把唯一的当前 SN 从待修转换为维修良品。',ADJUST_INCREASE:'异常库存增加；原因必填并新增审计流水。',ADJUST_DECREASE:'异常库存减少；显示调整前后数量。',OPENING_BALANCE:'仅用于迁移或系统初始化。'};return descriptions[workflow]??'';}
