import Link from 'next/link';

const navItems = [
  ['/dashboard', 'Dashboard'], ['/work-orders', '工单 / 备货'], ['/returns', '旧机接收'],
  ['/moves', '移库'], ['/adjustments', '库存调整'], ['/labels', 'Label'],
] as const;

export default function WarehouseLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
        <div className="system-chip"><span /> Feishu ledger · system of record</div>
      </aside>
      <main className="content-shell">{children}</main>
    </div>
  );
}
