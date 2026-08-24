import { LiveDashboardQueryService } from '../../../src/application/dashboardService';
import type { DashboardSnapshot } from '../../../src/application/contracts';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../src/ledger/businessDate';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const today = todayInSydney();
  let snapshot: DashboardSnapshot | undefined;
  try {
    await authenticateWarehousePage('DASHBOARD_READ');
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
      {!snapshot ? <div className="notice error"><strong>系统读取失败</strong><br />请检查服务端飞书表格配置和工作表结构。页面不会使用缓存库存或静默回退。</div> : <DashboardContent snapshot={snapshot} />}
    </>
  );
}

function DashboardContent({ snapshot }: { snapshot: DashboardSnapshot }) {
  const metrics = [
    ['今日备货工单', snapshot.metrics.todayPreparedWorkOrders],
    ['待备货', snapshot.metrics.awaitingPreparation],
    ['待取货（派生）', snapshot.metrics.awaitingPickup],
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
        <Section title="库存按库位"><DataTable headers={['Location', 'Available Qty']} rows={snapshot.inventoryByLocation.map((item) => [item.location, item.availableQty])} /></Section>
        <Section title="库存按属性"><DataTable headers={['Condition', 'Available Qty']} rows={snapshot.inventoryByCondition.map((item) => [item.condition, item.availableQty])} /></Section>
        <Section title="期间活动 · QTY"><DataTable headers={['Metric', 'Qty']} rows={[
          ['本周发货', snapshot.activityBreakdowns.thisWeekShippedQty],
          ['本周返修', snapshot.activityBreakdowns.thisWeekReturnedQty],
          ['本月发货', snapshot.activityBreakdowns.thisMonthShippedQty],
        ]} /></Section>
        <Section title="异常待处理"><DataTable headers={['Code', 'Count']} rows={snapshot.exceptions.map((item) => [item.code, item.count])} /></Section>
        <Section title="最近备货"><DataTable headers={['Date', 'Pickup', 'SH', 'SKU', 'Qty', 'Location']} rows={snapshot.recentPrepared.map((item) => [item.businessDate, item.pickupCode, item.sh, item.sku, item.qty, item.location])} /></Section>
        <Section title="最近返修"><DataTable headers={['Date', 'SKU', 'Qty', 'To Location']} rows={snapshot.recentReturns.map((item) => [item.businessDate, item.sku, item.qty, item.location])} /></Section>
      </div>
      <p className="metric-hint">指标口径：今日备货=SH COUNT；待取货/今日已出库=TASK COUNT（Pickup 优先、SH 回退）；今日返修与库存/期间活动=QTY；异常=ISSUE COUNT；待备货=UNAVAILABLE。</p>
      <ul className="notes">{snapshot.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card section-card"><h3>{title}</h3>{children}</section>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number | null>> }) {
  if (rows.length === 0) return <div className="empty-state">当前来源没有可显示记录</div>;
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${index}-${row.join('-')}`}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell ?? '—'}</td>)}</tr>)}</tbody></table></div>;
}
