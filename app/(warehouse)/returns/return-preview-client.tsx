'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckSquare, IdentificationCard, LockSimple, WarningCircle } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { BadMachineReceivePreview, ManualMaterialOverride } from '../../../src/application/badMachineReceive';
import { ControlledActionPanel } from '../controlled-action-panel';

export function ReturnPreviewClient({ initialBusinessDate, operatorName }: { initialBusinessDate: string; operatorName: string }) {
  const [snText, setSnText] = useState('');
  const [preview, setPreview] = useState<BadMachineReceivePreview>();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [activeIndex, setActiveIndex] = useState<number>();
  const [overrides, setOverrides] = useState<Record<number, ManualMaterialOverride>>({});
  const [manualMaterial, setManualMaterial] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const activeRow = preview?.rows.find((row) => row.index === activeIndex);
  const pendingReview = useMemo(() => preview?.rows.filter((row) => row.resolution.requiresManualReview && !overrides[row.index]).length ?? 0, [preview, overrides]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!snText.trim()) return;
    setLoading(true); setError(undefined); setPreview(undefined); setOverrides({}); setActiveIndex(undefined);
    try {
      const response = await fetch('/api/warehouse/returns/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sns: snText }) });
      const payload = await response.json() as ApiResponse<BadMachineReceivePreview>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setPreview(payload.data);
      setSelected(new Set(payload.data.rows.filter((row) => row.defaultSelected).map((row) => row.index)));
      setActiveIndex(payload.data.rows[0]?.index);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '系统读取失败'); }
    finally { setLoading(false); }
  }

  function openRow(index: number) {
    setActiveIndex(index); setManualMaterial(overrides[index]?.manualMaterial ?? ''); setManualReason(overrides[index]?.reason ?? '');
  }
  function toggle(index: number) {
    const row = preview?.rows.find((item) => item.index === index);
    if (!row || row.issues.includes('DUPLICATE_IN_BATCH') || row.issues.some((item) => item.startsWith('ALREADY_IN_INVENTORY'))) return;
    if (row.resolution.requiresManualReview && !overrides[index]) { openRow(index); return; }
    setSelected((current) => { const next = new Set(current); next.has(index) ? next.delete(index) : next.add(index); return next; });
  }
  function applyOverride() {
    if (!activeRow || !manualMaterial || !manualReason.trim()) return;
    const audit: ManualMaterialOverride = {
      sn: activeRow.sn, ...(activeRow.resolution.materialCode ? { autoSuggestedMaterial: activeRow.resolution.materialCode } : {}),
      manualMaterial, operator: operatorName, timestamp: new Date().toISOString(), reason: manualReason.trim(),
    };
    setOverrides((current) => ({ ...current, [activeRow.index]: audit }));
    if (!activeRow.issues.includes('DUPLICATE_IN_BATCH') && !activeRow.issues.some((item) => item.startsWith('ALREADY_IN_INVENTORY'))) setSelected((current) => new Set(current).add(activeRow.index));
  }

  return <div className="operations-console return-console resolver-console">
    <aside className="console-rail">
      <ControlledActionPanel action="退回维修" workflow="坏机接收" effect="增加待修库存" />
      <form className="import-panel" onSubmit={submit}>
        <div className="auto-field"><span>悉尼业务日</span><strong>{initialBusinessDate}</strong><small>系统自动带入</small></div>
        <label>坏机 SN（每行一个，可从 Excel 粘贴）<textarea className="sn-batch-input" value={snText} onChange={(event) => setSnText(event.target.value)} placeholder={'60KB103061NB141\n60CQ00L0623Y117\n60E5M48R65XX999'} /></label>
        <button className="outline-button" disabled={!snText.trim() || loading}><IdentificationCard size={18} />{loading ? '读取飞书并解析…' : '解析 SN'}</button>
      </form>
      <div className="resolver-principle"><strong>不使用 AI 猜测</strong><span>Exact history → revision whitelist → family rule → review</span></div>
      <Link className="secondary-workflow" href="/work-orders"><ArrowLeft size={18} /><span><strong>返回库存操作台</strong><small>工单备货与人工确认</small></span></Link>
    </aside>
    <section className="console-main">
      <div className="job-summary"><div><h3>{preview ? `坏机接收批次 · ${preview.summary.total} 台` : '等待输入 SN'}</h3><p>SN 编码状态只用于解析，不代表当前库存属性。</p></div><span>规则解析 · 可审计</span></div>
      <div className="job-stats"><span>默认可选 <b>{preview?.summary.ready ?? 0}</b></span><span>待人工确认 <b>{preview?.summary.reviewRequired ?? 0}</b></span><span>已选择 <b>{selected.size}</b></span><span>目标 <b>REPAIR-01</b></span></div>
      {error && <div className="inline-alert danger"><WarningCircle size={19} />{error}</div>}
      {!preview && !error && <div className="console-empty"><IdentificationCard size={36} /><strong>粘贴坏机 SN</strong><span>系统会读取飞书历史、识别料号并检查重复/在库/出库记录。</span></div>}
      {preview && <div className="console-table-wrap"><table className="console-table resolver-table"><thead><tr><th>选择</th><th>SN</th><th>编码状态</th><th>机型 / 产品族</th><th>自动料号</th><th>Confidence</th><th>接收检查</th></tr></thead><tbody>{preview.rows.map((row) => {
        const override = overrides[row.index];
        const blocked = row.issues.includes('DUPLICATE_IN_BATCH') || row.issues.some((item) => item.startsWith('ALREADY_IN_INVENTORY'));
        return <tr key={`${row.index}-${row.sn}`} className={activeIndex === row.index ? 'selected' : ''} onClick={() => openRow(row.index)}>
          <td><input type="checkbox" checked={selected.has(row.index)} disabled={blocked} onClick={(event) => event.stopPropagation()} onChange={() => toggle(row.index)} aria-label={`选择 ${row.sn}`} /></td>
          <td><strong>{row.sn}</strong><small>{row.resolution.canonicalSn}</small></td>
          <td>{statusLabel(row.resolution.snStatus)}</td>
          <td>{row.resolution.model ?? '—'}<small>{row.resolution.family ?? '未知产品族'}</small></td>
          <td>{override ? <><del>{row.resolution.materialCode ?? 'UNKNOWN'}</del><strong className="manual-value">{override.manualMaterial === '__UNKNOWN__' ? 'UNKNOWN · 待补料号' : override.manualMaterial}</strong></> : row.resolution.materialCode ?? '—'}</td>
          <td><span className={`confidence ${row.resolution.confidence === 'REVIEW_REQUIRED' ? 'review' : 'exact'}`}>{row.resolution.confidence}</span><small>{row.resolution.matchedRuleId ?? row.resolution.matchMethod}</small></td>
          <td>{row.issues.length ? row.issues.map((issue) => <span className={`issue-chip ${issue === 'PREVIOUSLY_OUTBOUND' ? 'info' : ''}`} key={issue}>{issueLabel(issue)}</span>) : <span className="row-status ok">Ready</span>}</td>
        </tr>;
      })}</tbody></table></div>}
      {preview && <div className="batch-selection"><CheckSquare size={18} /><span>已选择 {selected.size} / {preview.summary.total} 台</span>{pendingReview > 0 && <b>{pendingReview} 台仍需人工确认</b>}<button disabled>确认接收（UAT 零写入）</button></div>}
    </section>
    <aside className="detail-panel resolver-detail"><h3>解析与人工确认</h3>
      {!activeRow ? <p className="detail-empty">选择一条 SN 查看匹配证据。</p> : <>
        <dl><dt>输入 SN</dt><dd>{activeRow.sn}</dd><dt>Canonical</dt><dd>{activeRow.resolution.canonicalSn}</dd><dt>匹配方式</dt><dd>{activeRow.resolution.matchMethod}</dd><dt>规则 ID</dt><dd>{activeRow.resolution.matchedRuleId ?? '—'}</dd><dt>原因</dt><dd>{activeRow.resolution.reason}</dd><dt>飞书状态</dt><dd>{activeRow.operationalState.currentState}</dd></dl>
        {activeRow.operationalState.previouslyOutbound && <div className="inline-alert warning">Previously Outbound · 允许重新接收</div>}
        <div className="detail-section override-form"><h4>Manual Override</h4><p>不会覆盖自动结果；系统单独保留人工料号、操作人、时间和原因。</p>
          <label>人工料号<select value={manualMaterial} onChange={(event) => setManualMaterial(event.target.value)}><option value="">请选择</option><option value="__UNKNOWN__">UNKNOWN · 接收后进入待补料号队列</option>{preview?.materialOptions.map((item) => <option value={item.materialCode} key={item.materialCode}>{item.materialCode}{item.model ? ` · ${item.model}` : ''}</option>)}</select></label>
          <label>确认原因<textarea value={manualReason} onChange={(event) => setManualReason(event.target.value)} placeholder="说明核对依据或为何暂存 UNKNOWN" /></label>
          <button className="outline-button" onClick={applyOverride} disabled={!manualMaterial || !manualReason.trim()}>应用人工确认（仅本次预览）</button>
        </div>
        {overrides[activeRow.index] && <div className="override-audit"><strong>审计记录已生成</strong><span>Operator · {overrides[activeRow.index]!.operator}</span><span>{overrides[activeRow.index]!.timestamp}</span><span>Reason · {overrides[activeRow.index]!.reason}</span></div>}
      </>}
      <button className="locked-action" disabled><LockSimple size={18} />写入飞书（UAT 锁定）</button>
    </aside>
  </div>;
}

function statusLabel(status: string): string { return status === 'ORIGINAL' ? 'Original（编码）' : status === 'REPAIRED_GOOD' ? 'Repaired（编码）' : 'Unknown'; }
function issueLabel(issue: string): string {
  if (issue === 'DUPLICATE_IN_BATCH') return '批内重复';
  if (issue === 'PREVIOUSLY_OUTBOUND') return 'Previously Outbound';
  if (issue === 'MATERIAL_REVIEW_REQUIRED') return 'Manual Review';
  if (issue.startsWith('ALREADY_IN_INVENTORY')) return `已在库存 · ${issue.split(':')[1]}`;
  return issue;
}
