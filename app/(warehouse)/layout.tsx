import { redirect } from 'next/navigation';
import { authenticateWarehouseSessionPage } from '../../src/auth/pageAuth';
import { WarehouseNav } from './warehouse-nav';

export default async function WarehouseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try { await authenticateWarehouseSessionPage(); } catch { redirect('/'); }
  return (
    <div className="app-shell">
      <header className="app-topbar"><div className="wordmark"><strong>FOX</strong><small>ESS</small></div><div className="product-name">Sydney Warehouse</div><WarehouseNav/><div className="topbar-meta"><span className="uat-chip">UAT 只读</span><span>Sydney</span></div><form action="/api/auth/logout" method="post"><button className="topbar-logout" type="submit">退出</button></form></header>
      <main className="content-shell">{children}</main>
    </div>
  );
}
