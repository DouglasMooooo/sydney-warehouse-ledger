import { LiveDashboardQueryService } from '../../../src/application/dashboardService';
import type { DashboardSnapshot } from '../../../src/application/contracts';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../src/ledger/businessDate';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const today = todayInSydney();
  let snapshot: DashboardSnapshot | undefined;
  try {
    snapshot = await new LiveDashboardQueryService(warehouseReadAdapterFromEnv()).getSnapshot(today);
  } catch (error) {
    console.error('Dashboard source read failed', error);
  }
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">OPERATIONS OVERVIEW</p><h2>Dashboard</h2><p>Sydney business date · {today}</p></div>
        <div className="live-badge">Read only · Live Feishu source</div>
      </header>
      {!snapshot ? <div className="notice error"><strong>系统读取失败</strong><br />请检查服务端飞书配置和 CLI 登录状态。页面不会使用缓存库存或静默回退。</div> : <DashboardContent snapshot={snapshot} />}
    </>
  );
}

function DashboardContent({ snapshot }: { snapshot: DashboardSnapshot }) {
  const metrics = [
    ['今日新工单', snapshot.metrics.todayNewWorkOrders],
    ['待备货', snapshot.metrics.awaitingPreparation],
    ['待取货', snapshot.metrics.awaitingPickup],
    ['今日已出库', snapshot.metrics.shippedToday],
    ['今日返修', snapshot.metrics.returnedToday],
    ['异常数量', snapshot.metrics.exceptionCount],
  ] as const;
  const inventory = [
    ['新机', snapshot.inventory.newUnits], ['维修良品', snapshot.inventory.repairedGood],
    ['待修', snapshot.inventory.pendingRepair], ['维修库存', snapshot.inventory.repairInventory],
    ['报废', snapshot.inventory.scrapped],
  ] as const;
  return (
    <>
      <section className="metric-grid">{metrics.map(([label, value]) => <div className="card metric-card" key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}</section>
      <section className="inventory-grid">{inventory.map(([label, value]) => <div className="card inventory-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      <div className="section-grid">
        <Section title="库存按机型"><DataTable headers={['Model', 'Condition', 'Available']} rows={snapshot.inventoryByModel.map((item) => [item.model, item.condition, item.availableQty])} /></Section>
        <Section title="异常待处理"><DataTable headers={['Code', 'Count']} rows={snapshot.exceptions.map((item) => [item.code, item.count])} /></Section>
        <Section title="最近备货"><DataTable headers={['Date', 'Pickup', 'SH', 'SKU', 'Qty', 'Location']} rows={snapshot.recentPrepared.map((item) => [item.businessDate, item.pickupCode, item.sh, item.sku, item.qty, item.location])} /></Section>
        <Section title="最近返修"><DataTable headers={['Date', 'SKU', 'Qty', 'To Location']} rows={snapshot.recentReturns.map((item) => [item.businessDate, item.sku, item.qty, item.location])} /></Section>
      </div>
      <ul className="notes">{snapshot.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card section-card"><h3>{title}</h3>{children}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  if (rows.length === 0) return <div className="empty-state">当前来源没有可显示记录</div>;
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${row.join('-')}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
