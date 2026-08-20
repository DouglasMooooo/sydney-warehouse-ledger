import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticateWarehouseSessionPage } from '../../src/auth/pageAuth';

const navItems = [
  ['/dashboard', 'Dashboard'], ['/tasks', '今日任务'], ['/warehouse-layout', '仓库布局'],
  ['/exceptions', '异常'], ['/work-orders', '工单预览'],
] as const;

export default async function WarehouseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try { await authenticateWarehouseSessionPage(); } catch { redirect('/'); }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">SYD</div>
        <div>
          <p className="eyebrow">FOX ESS · INTERNAL</p>
          <h1>Sydney Warehouse</h1>
          <p className="sidebar-copy">操作入口基于现有飞书台账，不建立第二套库存。</p>
        </div>
        <nav aria-label="Warehouse navigation">
          {navItems.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        <form action="/api/auth/logout" method="post"><button className="logout-button" type="submit">退出</button></form>
        <div className="system-chip"><span /> Feishu ledger · system of record</div>
      </aside>
      <main className="content-shell"><div className="read-only-banner">只读试运行</div>{children}</main>
    </div>
  );
}
