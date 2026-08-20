'use client';

import { useState } from 'react';
import type { ApiResponse } from '../../../src/application/apiResponse';
import type { DeepQualityScanResult } from '../../../src/application/deepQualityScan';

export function DeepQualityScanClient() {
  const [result, setResult] = useState<DeepQualityScanResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true); setError(undefined);
    try {
      const response = await fetch('/api/warehouse/exceptions/deep-scan', { method: 'POST' });
      const payload = await response.json() as ApiResponse<DeepQualityScanResult>;
      if (!payload.ok) throw new Error(`${payload.error.code} · ${payload.error.message}`);
      setResult(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '深度扫描失败'); }
    finally { setLoading(false); }
  }
  return <section className="card section-card"><div className="section-heading"><div><h3>深度数据质量检查</h3><p className="notes">按需读取单元格类型线索、公式和值；不会修改历史数据。</p></div><button className="primary-button" onClick={run} disabled={loading}>{loading ? '扫描中…' : '运行深度检查'}</button></div>{!result && !error && <div className="empty-state">状态：尚未运行</div>}{error && <div className="notice error">{error}</div>}{result && <><p className="notes">状态：{result.status} · 最后扫描：{result.scannedAt} · 扫描行：{result.scannedRows} · 异常：{result.issueCount}</p><div className="coverage-list">{result.ruleCoverage.map((rule) => <div key={rule.code}><strong>{rule.code}</strong><span className={`coverage-${rule.status.toLowerCase()}`}>{rule.status}</span>{rule.limitation && <small>{rule.limitation}</small>}</div>)}</div>{result.exceptions.length === 0 ? <div className="empty-state">本次可用规则未发现异常</div> : <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Code</th><th>Row</th><th>Description</th><th>Suggested action</th></tr></thead><tbody>{result.exceptions.map((item, index) => <tr key={`${item.code}-${item.ledgerRow ?? index}`}><td>{item.severity}</td><td>{item.code}</td><td>{item.ledgerRow ?? '—'}</td><td>{item.description}</td><td>{item.suggestedAction}</td></tr>)}</tbody></table></div>}</>}</section>;
}
