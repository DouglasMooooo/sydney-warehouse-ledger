'use client';

import { useState } from 'react';
import { DownloadSimple, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { LedgerAuditResult } from '../../../src/application/auditQueryService';
import type { InventoryQueryResult } from '../../../src/application/queries/inventoryQueryService';

export function AuditClient() {
  const [mode, setMode] = useState<'SH' | 'SN'>('SH');
  const [identifier, setIdentifier] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [result, setResult] = useState<LedgerAuditResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [inventorySku, setInventorySku] = useState('');
  const [inventoryModel, setInventoryModel] = useState('');
  const [inventoryCondition, setInventoryCondition] = useState('');
  const [inventory, setInventory] = useState<InventoryQueryResult>();
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [inventoryError, setInventoryError] = useState<string>();

  async function search() {
    if (!identifier.trim()) return;
    setBusy(true); setError(undefined);
    try {
      const params = new URLSearchParams({ [mode === 'SH' ? 'sh' : 'sn']: identifier.trim() });
      if (fromDate) params.set('from', fromDate); if (toDate) params.set('to', toDate);
      const response = await fetch(`/api/warehouse/audit?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as ApiResponse<LedgerAuditResult>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setResult(payload.data);
    } catch (cause) { setResult(undefined); setError(cause instanceof Error ? cause.message : '审计查询失败'); }
    finally { setBusy(false); }
  }

  async function searchInventory() {
    setInventoryBusy(true); setInventoryError(undefined);
    try {
      const params = new URLSearchParams();
      if (inventorySku.trim()) params.set('sku', inventorySku.trim());
      if (inventoryModel.trim()) params.set('model', inventoryModel.trim());
      if (inventoryCondition) params.set('condition', inventoryCondition);
      const response = await fetch(`/api/warehouse/inventory/query?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json() as ApiResponse<InventoryQueryResult>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setInventory(payload.data);
    } catch (cause) { setInventory(undefined); setInventoryError(cause instanceof Error ? cause.message : '库存查询失败'); }
    finally { setInventoryBusy(false); }
  }

  return <><header className="page-header"><div><p className="eyebrow">AUDIT & RECONCILIATION</p><h2>操作记录与对账</h2><p>精确追溯 SH 或 SN 的台账字段、操作轨迹和当前 SN 状态。数据实时读取飞书台账。</p></div><a className="export-link" href="/api/warehouse/export?scope=reconciliation"><DownloadSimple size={18}/>导出对账 Excel</a></header>
    <section className="card section-card inventory-search"><div className="section-heading"><div><h3>实时库存查询</h3><p>按料号、机型或库存属性查找所在货架与可用数量；不填条件即可查看当前全仓 SKU / 机型 / 新机与维修良品汇总。</p></div><span className="live-badge">LIVE INVENTORY</span></div><div className="audit-search-grid"><label>料号 / SKU<input value={inventorySku} onChange={(event) => setInventorySku(event.target.value.toUpperCase())} placeholder="97-141-00060-B0" /></label><label>机型（精确）<input value={inventoryModel} onChange={(event) => setInventoryModel(event.target.value)} placeholder="H3-10.0-Smart" /></label><label>库存属性<select value={inventoryCondition} onChange={(event) => setInventoryCondition(event.target.value)}><option value="">全部属性</option><option value="新机">新机</option><option value="维修良品">维修良品</option></select></label><button className="execute-button compact" type="button" onClick={() => void searchInventory()} disabled={inventoryBusy}><MagnifyingGlass size={18}/>{inventoryBusy ? '查询中…' : inventorySku || inventoryModel || inventoryCondition ? '查询库存' : '查看全仓汇总'}</button></div>{inventoryError && <div className="inline-alert danger"><WarningCircle size={17}/>{inventoryError}</div>}{inventory && <InventoryResult result={inventory} />}</section>
    <section className="card section-card audit-search"><div className="audit-mode"><button className={mode === 'SH' ? 'active' : ''} type="button" onClick={() => { setMode('SH'); setResult(undefined); }}>按 SH 单号</button><button className={mode === 'SN' ? 'active' : ''} type="button" onClick={() => { setMode('SN'); setResult(undefined); }}>按 SN</button></div><div className="audit-search-grid"><label>{mode === 'SH' ? 'SH 单号' : '机器 SN'}<input value={identifier} onChange={(event) => setIdentifier(mode === 'SH' ? event.target.value.toUpperCase() : event.target.value.toUpperCase().replace(/\s+/g, ''))} placeholder={mode === 'SH' ? 'SH-2608-00184741' : '60HD103064PM133'} onKeyDown={(event) => { if (event.key === 'Enter') void search(); }} /></label><label>开始日期（可选）<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>结束日期（可选）<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><button className="execute-button compact" type="button" onClick={() => void search()} disabled={busy || !identifier.trim()}><MagnifyingGlass size={18}/>{busy ? '查询中…' : '精确查询'}</button></div><p className="field-note">SH 查询展示该工单全部动作；SN 查询展示该机器的完整生命周期及关联 SH。查询结果最多 200 条，完整对账请导出 Excel。</p>{error && <div className="inline-alert danger"><WarningCircle size={17}/>{error}</div>}</section>
    {result && <AuditResult result={result} />}
  </>;
}

function InventoryResult({ result }: { result: InventoryQueryResult }) {
  if (!result.items.length) return <div className="empty-state inventory-empty">没有满足条件的当前库存。</div>;
  return <div className="table-wrap inventory-results"><p className="inventory-result-note">当前 {result.items.length} 个 SKU / 库存属性组合；每行显示总数与实际货架。</p><table className="audit-table inventory-table"><thead><tr><th>料号</th><th>机型</th><th>库存属性</th><th>可用数量</th><th>货架 / 库位明细</th></tr></thead><tbody>{result.items.map((item) => <tr key={`${item.sku}-${item.stockCondition}`}><td><b>{item.sku}</b></td><td>{item.displayName || '—'}</td><td><span className="condition-chip">{item.stockCondition}</span></td><td><b>{item.totalQty}</b></td><td>{item.locations.map((location) => <div className="inventory-location" key={location.location}><b>{location.location}</b><span>数量 {location.qty}</span>{location.containers?.length ? <small>容器：{location.containers.join('、')}</small> : null}</div>)}</td></tr>)}</tbody></table></div>;
}

function AuditResult({ result }: { result: LedgerAuditResult }) {
  const state = result.currentSnState;
  return <section className="card section-card audit-results"><div className="section-heading"><div><h3>{result.query.type === 'SH' ? `SH：${result.query.value}` : `SN：${result.query.value}`}</h3><p>飞书操作台账 · {result.records.length} 条记录{result.truncated ? '（结果已截断，请导出完整对账文件）' : ''}</p></div><span className="live-badge">LIVE LEDGER</span></div>
    {state && <div className="audit-state"><strong>当前 SN 状态</strong><span>{state.status}</span>{state.status === 'IN_STOCK' && <small>{state.sku} · {state.location} · {state.stockCondition}</small>}{state.status === 'OUTBOUND' && <small>{state.sku} · {state.shNo ?? '未关联 SH'}</small>}</div>}
    <div className={`wms-monitor ${result.wmsMonitor.state === 'NOT_CONFIGURED' ? 'warning' : ''}`}><strong>WMS 反写监控：{result.wmsMonitor.state}</strong><span>{result.wmsMonitor.message}</span></div>
    {!result.records.length ? <div className="empty-state">没有匹配记录。</div> : <div className="table-wrap"><table className="audit-table"><thead><tr><th>日期</th><th>动作</th><th>SH / Pickup</th><th>SKU / 机型</th><th>SN</th><th>数量</th><th>库位</th><th>属性</th><th>ERP 仓库</th><th>WMS 反写</th><th>备注 / 审计状态</th></tr></thead><tbody>{result.records.map((item) => <tr key={item.movementId}><td>{item.businessDate}{item.occurredAt ? <small>出库：{item.occurredAt}</small> : null}</td><td><b>{item.ledgerAction}</b><small>{item.workflow ?? '—'}</small></td><td>{item.shNo || '—'}<small>{item.pickupCode || '—'}</small></td><td>{item.sku || '—'}<small>{item.displayName || '—'}</small></td><td>{item.sn || '—'}</td><td>{item.qty}</td><td>{item.fromLocation ? `${item.fromLocation} → ${item.toLocation || '出库'}` : item.toLocation || '—'}</td><td>{item.stockConditionAfter ?? item.stockConditionBefore ?? '—'}</td><td>{item.erpWarehouse || '—'}</td><td><b>{result.wmsMonitor.state}</b><small>未尝试</small></td><td>{item.reason || '—'}<small>{item.verificationStatus} · {item.origin}</small></td></tr>)}</tbody></table></div>}
    {result.issues.length > 0 && <div className="inline-alert danger"><WarningCircle size={17}/>发现 {result.issues.length} 条台账校验提示：{[...new Set(result.issues.map((item) => item.code))].join('、')}</div>}
  </section>;
}
