import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { isVisualDemoMode, visualDemoLocations } from '../../../src/demo/visualDemo';

export const dynamic = 'force-dynamic';

export default async function WarehouseLayoutPage() {
  try {
    await authenticateWarehousePage('INVENTORY_READ');
    const snapshot = isVisualDemoMode() ? visualDemoLocations() : await warehouseReadAdapterFromEnv().readLocationSummaries();
    const groups = [
      { title: 'R1', locations: snapshot.locations.filter((item) => item.location.startsWith('R1-')) },
      { title: 'R2', locations: snapshot.locations.filter((item) => item.location.startsWith('R2-')) },
      { title: '服务区', locations: snapshot.locations.filter((item) => !/^R[12]-/.test(item.location)) },
    ];
    return <><Header />{groups.map((group) => <section className="layout-zone" key={group.title}><h3>{group.title}</h3><div className="location-grid">{group.locations.map((item) => <article className={`card location-card${item.totalQty === 0 ? ' empty-location' : ''}`} key={item.location}><strong>{item.location}</strong>{item.skuLines.length === 0 && <span>空</span>}{item.skuLines.map((line) => <span key={line.sku}>{line.sku} × {line.qty}</span>)}{item.containers.length > 0 && <small>容器: {item.containers.join(', ')}</small>}<b>总数: {item.totalQty}</b></article>)}</div></section>)}{snapshot.issues.length > 0 && <div className="notice error">有 {snapshot.issues.length} 条库存数量异常被排除；系统没有将其当作 0 或猜测数量。</div>}</>;
  } catch {
    return <><Header /><div className="notice error">身份、权限或当前库存读取失败。</div></>;
  }
}

function Header() { const demo = isVisualDemoMode(); return <header className="page-header"><div><p className="eyebrow">PHYSICAL LOCATION</p><h2>仓库布局</h2><p>{demo ? '使用脱敏示例库位和料号展示布局效果。' : '只使用“当前库存明细查询”，按真实 SKU 展示。'}</p></div><div className="live-badge">{demo ? 'Visual demo · Sample SKU' : 'Read only · SKU level'}</div></header>; }
