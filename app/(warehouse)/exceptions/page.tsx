import { resolveWarehouseAuthContext } from '../../../src/auth/authContext';
import { requireWarehousePermission } from '../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';

export const dynamic = 'force-dynamic';

export default function ExceptionsPage() {
  try {
    const auth = resolveWarehouseAuthContext();
    requireWarehousePermission(auth, 'TASK_READ');
    const snapshot = warehouseReadAdapterFromEnv().readOperationalExceptions();
    return <><Header /><section className="card section-card"><div className="table-wrap"><table><thead><tr><th>Severity</th><th>Code</th><th>Row</th><th>SH / Pickup</th><th>SKU / SN</th><th>Description</th><th>Suggested action</th></tr></thead><tbody>{snapshot.exceptions.map((item, index) => <tr key={`${item.code}-${item.ledgerRow ?? index}`}><td>{item.severity}</td><td>{item.code}</td><td>{item.ledgerRow ?? '—'}</td><td>{item.pickupCode || item.sh || '—'}</td><td>{item.sku || item.sn || '—'}</td><td>{item.description}</td><td>{item.suggestedAction}</td></tr>)}</tbody></table></div>{snapshot.exceptions.length === 0 && <div className="empty-state">当前规则未发现异常</div>}</section><p className="notes">支持规则：{snapshot.supportedCodes.join(' · ')}</p></>;
  } catch {
    return <><Header /><div className="notice error">身份、权限或异常来源读取失败。</div></>;
  }
}

function Header() { return <header className="page-header"><div><p className="eyebrow">EXCEPTIONS</p><h2>异常待处理</h2><p>只读提示；不创建工单，不自动修复历史数据。</p></div><div className="live-badge">Read only</div></header>; }
