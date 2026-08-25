import Link from 'next/link';
import { DownloadSimple } from '@phosphor-icons/react/dist/ssr';
import { authenticateWarehousePage } from '../../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { parseBusinessDateString, todayInSydney } from '../../../../src/ledger/businessDate';

export const dynamic = 'force-dynamic';

export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  await authenticateWarehousePage('DASHBOARD_READ');
  const query = await searchParams;
  const asOf = parseBusinessDateString(query.date) ?? todayInSydney();
  const report = await warehouseReadAdapterFromEnv().readWeeklyReport(asOf);
  const cards = [
    ['售后回收入库', report.metrics.returnedForRepair], ['维修完成', report.metrics.repairCompleted],
    ['维修报废', report.metrics.repairScrapped], ['报废出库', report.metrics.scrapOutbound],
    ['待报废', report.metrics.pendingScrap], ['维修良品入库', report.metrics.repairedGoodInbound],
    ['新机入库', report.metrics.newInbound], ['新机发货', report.metrics.newShipped],
    ['维修良品发货', report.metrics.repairedGoodShipped], ['备货单据', report.metrics.preparedDocuments],
    ['出货单据', report.metrics.outboundDocuments], ['新机库存', report.metrics.currentNew],
    ['维修良品库存', report.metrics.currentRepairedGood], ['待修', report.metrics.currentPendingRepair],
  ] as const;
  return <><header className="page-header"><div><p className="eyebrow">WEEKLY OPERATIONS</p><h2>悉尼仓库周报</h2><p>{report.weekStart} ～ {report.weekEnd}</p></div><div className="report-actions"><form><input name="date" type="date" defaultValue={asOf}/><button type="submit">切换周</button></form><Link href={`/api/warehouse/export?date=${asOf}`}><DownloadSimple size={17}/>导出 Excel</Link></div></header>
    <section className="metric-grid">{cards.map(([label,value])=><div className="card metric-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className="card section-card"><h3>整机按机型</h3><div className="table-wrap"><table><thead><tr><th>机型</th><th>新机发货</th><th>维修良品发货</th><th>当前库存</th><th>新机库存</th><th>维修良品库存</th></tr></thead><tbody>{report.byModel.map(item=><tr key={item.model}><td>{item.model}</td><td>{item.newShipped}</td><td>{item.repairedGoodShipped}</td><td>{item.current}</td><td>{item.newStock}</td><td>{item.repairedGoodStock}</td></tr>)}</tbody></table></div></section>
    <ul className="notes">{report.notes.map(note=><li key={note}>{note}</li>)}</ul></>;
}
