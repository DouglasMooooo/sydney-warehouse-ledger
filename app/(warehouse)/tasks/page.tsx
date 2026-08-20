import { resolveWarehouseAuthContext } from '../../../src/auth/authContext';
import { requireWarehousePermission } from '../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../src/ledger/businessDate';
import type { OperationalTask } from '../../../src/application/todayTasks';

export const dynamic = 'force-dynamic';

export default function TasksPage() {
  try {
    const auth = resolveWarehouseAuthContext();
    requireWarehousePermission(auth, 'TASK_READ');
    const snapshot = warehouseReadAdapterFromEnv().readTodayTasks(todayInSydney());
    return <><PageHeader /><div className="section-grid">
      <TaskSection title="今日备货工单 · SH COUNT" tasks={snapshot.todayPrepared} />
      <TaskSection title="待取货（派生）· TASK COUNT" tasks={snapshot.awaitingPickup} />
      <TaskSection title="今日已出库 · TASK COUNT" tasks={snapshot.todayOutbound} />
      <TaskSection title="今日返修 · QTY" tasks={snapshot.todayReturns} />
    </div><ul className="notes">{snapshot.notes.map((note) => <li key={note}>{note}</li>)}</ul></>;
  } catch {
    return <><PageHeader /><div className="notice error">身份、权限或飞书来源读取失败。没有使用缓存数据。</div></>;
  }
}

function PageHeader() { return <header className="page-header"><div><p className="eyebrow">TODAY TASKS</p><h2>今日任务</h2><p>所有状态由现有台账实时派生，没有人工 Status 列。</p></div><div className="live-badge">Read only</div></header>; }

function TaskSection({ title, tasks }: { title: string; tasks: OperationalTask[] }) {
  return <section className="card section-card"><h3>{title}</h3>{tasks.length === 0 ? <div className="empty-state">当前无任务</div> : <div className="table-wrap"><table><thead><tr><th>Pickup</th><th>SH</th><th>明细</th><th>状态</th></tr></thead><tbody>{tasks.map((task, index) => <tr key={`${task.taskType}-${task.pickupCode ?? task.sh}-${index}`}><td>{task.pickupCode || '—'}</td><td>{task.sh || '—'}</td><td>{task.details.map((item) => `${item.sku ?? item.sn ?? '—'} × ${item.qty ?? '—'}`).join('；')}</td><td>{task.derivedState}</td></tr>)}</tbody></table></div>}</section>;
}
