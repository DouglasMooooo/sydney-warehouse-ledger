import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { DeepQualityScanClient } from './deep-scan-client';
import { isVisualDemoMode, visualDemoExceptions } from '../../../src/demo/visualDemo';

export const dynamic = 'force-dynamic';

export default async function ExceptionsPage() {
  try {
    await authenticateWarehousePage('TASK_READ');
    const visualDemo = isVisualDemoMode();
    const snapshot = visualDemo ? visualDemoExceptions() : await warehouseReadAdapterFromEnv().readOperationalExceptions();
    return <><Header /><section className="card section-card"><h3>{visualDemo ? '演示异常' : '实时异常'}</h3><ExceptionTable items={snapshot.exceptions} empty="当前实时规则未发现异常" /><p className="notes">本区实际执行：{snapshot.supportedCodes.join(' · ')}</p></section>{!visualDemo && <DeepQualityScanClient />}</>;
  } catch {
    return <><Header /><div className="notice error">身份、权限或异常来源读取失败。</div></>;
  }
}

function ExceptionTable({ items, empty }: { items: Array<{ severity: string; code: string; ledgerRow?: number; pickupCode?: string; sh?: string; sku?: string; sn?: string; description: string; suggestedAction: string }>; empty: string }) {
  if (items.length === 0) return <div className="empty-state">{empty}</div>;
  return <div className="table-wrap"><table><thead><tr><th>Severity</th><th>Code</th><th>Row</th><th>SH / Pickup</th><th>SKU / SN</th><th>Description</th><th>Suggested action</th></tr></thead><tbody>{items.map((item, index) => <tr key={`${item.code}-${item.ledgerRow ?? index}`}><td>{item.severity}</td><td>{item.code}</td><td>{item.ledgerRow ?? '—'}</td><td>{item.pickupCode || item.sh || '—'}</td><td>{item.sku || item.sn || '—'}</td><td>{item.description}</td><td>{item.suggestedAction}</td></tr>)}</tbody></table></div>;
}

function Header() { return <header className="page-header"><div><p className="eyebrow">EXCEPTIONS</p><h2>异常待处理</h2><p>实时规则与按需深度扫描明确分离；页面不自动声称深度检查已运行。</p></div><div className="live-badge">Read only</div></header>; }
