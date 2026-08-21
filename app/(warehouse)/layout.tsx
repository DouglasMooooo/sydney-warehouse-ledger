import Link from 'next/link';
import { redirect } from 'next/navigation';
import { authenticateWarehouseSessionPage } from '../../src/auth/pageAuth';
import { isGoogleSheetsUatMode, isVisualDemoMode } from '../../src/demo/visualDemo';

const navItems = [
  ['/dashboard', 'Dashboard'], ['/tasks', '今日任务'], ['/warehouse-layout', '仓库布局'],
  ['/exceptions', '异常'], ['/work-orders', '工单预览'],
] as const;

export default async function WarehouseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  try { await authenticateWarehouseSessionPage(); } catch { redirect('/'); }
  const visualDemo = isVisualDemoMode();
  const googleSheetsUat = isGoogleSheetsUatMode();
  const visibleNavItems = visualDemo ? navItems.filter(([href]) => href !== '/work-orders') : navItems;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">SYD</div>
        <div>
          <p className="eyebrow">FOX ESS · INTERNAL</p>
          <h1>Sydney Warehouse</h1>
          <p className="sidebar-copy">{googleSheetsUat ? 'UAT 直接读取指定 Google Sheet；不执行库存写入。' : visualDemo ? '视觉演示仅使用内置脱敏样例，不连接真实库存。' : '操作入口基于现有飞书台账，不建立第二套库存。'}</p>
        </div>
        <nav aria-label="Warehouse navigation">
          {visibleNavItems.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
        {visualDemo ? <Link className="logout-button" href="/">返回首页</Link> : <form action="/api/auth/logout" method="post"><button className="logout-button" type="submit">退出</button></form>}
        <div className="system-chip"><span /> {googleSheetsUat ? 'Google Sheet · UAT source' : visualDemo ? 'Sample data · visual demo' : 'Feishu ledger · system of record'}</div>
      </aside>
      <main className="content-shell"><div className="read-only-banner">{googleSheetsUat ? 'Google Sheet UAT · 工单仅预览 · 零写入' : visualDemo ? '视觉演示 · 脱敏样例 · 非真实库存' : '只读试运行'}</div>{children}</main>
    </div>
  );
}
