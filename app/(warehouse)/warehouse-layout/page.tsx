import { MapPinLine } from '@phosphor-icons/react/dist/ssr';
import { parseRackLocation, compareRackPositions } from '../../../src/application/locationVisualisation';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';

export const dynamic = 'force-dynamic';

export default async function WarehouseLayoutPage() {
  try {
    await authenticateWarehousePage('INVENTORY_READ');
    const snapshot = await warehouseReadAdapterFromEnv().readLocationSummaries();
    const rackLocations = snapshot.locations.map((item) => ({ item, position: parseRackLocation(item.location) })).filter((entry): entry is typeof entry & { position: NonNullable<typeof entry.position> } => Boolean(entry.position)).sort((left, right) => compareRackPositions(left.position, right.position));
    const serviceLocations = snapshot.locations.filter((item) => !parseRackLocation(item.location));
    const racks = [...new Set(rackLocations.map((entry) => entry.position.rack))];

    return <>
      <Header />
      <section className="location-code-guide">
        <div className="code-example"><strong>R1-2-3-L</strong><span>一个库位代码</span></div>
        <CodePart label="R1" value="货架 1" />
        <CodePart label="2" value="第 2 排" />
        <CodePart label="3" value="第 3 个 Bay" />
        <CodePart label="L / R" value="左侧 / 右侧" />
      </section>
      {racks.map((rack) => {
        const rackEntries = rackLocations.filter((entry) => entry.position.rack === rack);
        const rows = [...new Set(rackEntries.map((entry) => entry.position.row))];
        return <section className="rack-section" key={rack}>
          <div className="rack-heading"><div><span>R{rack}</span><h3>货架 {rack}</h3></div><small>{rackEntries.length} 个登记库位</small></div>
          <div className="rack-body">{rows.map((row) => {
            const rowEntries = rackEntries.filter((entry) => entry.position.row === row);
            const bays = [...new Set(rowEntries.map((entry) => entry.position.bay))];
            return <div className="rack-row" key={row}><div className="row-label"><strong>第 {row} 排</strong><span>ROW {row}</span></div><div className="bay-grid">{bays.map((bay) => {
              const bayEntries = rowEntries.filter((entry) => entry.position.bay === bay);
              return <article className="bay-card" key={bay}><header><strong>Bay {bay}</strong><span>第 {bay} 个 Bay</span></header><div className="bay-sides">{(['L', 'R'] as const).map((side) => {
                const entry = bayEntries.find((candidate) => candidate.position.side === side);
                return entry ? <LocationSide key={side} side={side} entry={entry} /> : <div className="location-side unregistered" key={side}><span>{side === 'L' ? '左侧' : '右侧'}</span><small>未登记</small></div>;
              })}{bayEntries.filter((entry) => entry.position.side === 'M').map((entry) => <LocationSide key="M" side="M" entry={entry} />)}</div></article>;
            })}</div></div>;
          })}</div>
        </section>;
      })}
      {serviceLocations.length > 0 && <section className="layout-zone service-zone"><div className="rack-heading"><div><span>SERVICE</span><h3>维修与弹性区域</h3></div></div><div className="location-grid">{serviceLocations.map((item) => <article className={`card location-card${item.totalQty === 0 ? ' empty-location' : ''}`} key={item.location}><strong>{item.location}</strong>{item.skuLines.length === 0 && <span>空</span>}{item.skuLines.map((line) => <span key={line.sku}>{line.sku} × {line.qty}</span>)}{item.containers.length > 0 && <small>容器：{item.containers.join(', ')}</small>}<b>总数：{item.totalQty}</b></article>)}</div></section>}
      {snapshot.issues.length > 0 && <div className="notice error">有 {snapshot.issues.length} 条库存数量异常被排除；系统没有将其当作 0 或猜测数量。</div>}
    </>;
  } catch {
    return <><Header /><div className="notice error">身份、权限或当前库存读取失败。</div></>;
  }
}

function Header() { return <header className="page-header warehouse-map-header"><div><p className="eyebrow">PHYSICAL WAREHOUSE MAP</p><h2>仓库布局</h2><p>按货架、排、Bay 和左右位置展示实时 SKU 库存。</p></div><div className="live-badge"><MapPinLine size={16} />只读实时库存</div></header>; }
function CodePart({ label, value }: { label: string; value: string }) { return <div className="code-part"><strong>{label}</strong><span>{value}</span></div>; }

function LocationSide({ side, entry }: { side: 'L' | 'R' | 'M'; entry: { item: { location: string; totalQty: number; skuLines: Array<{ sku: string; qty: number }>; containers: string[] }; position: { sideLabel: string; description: string } } }) {
  const { item, position } = entry;
  return <div className={`location-side${item.totalQty === 0 ? ' empty-location' : ''}`} title={position.description}><div className="side-title"><span>{position.sideLabel}</span><strong>{side}</strong></div><code>{item.location}</code><div className="side-skus">{item.skuLines.length === 0 ? <small>空库位</small> : item.skuLines.map((line) => <small key={line.sku}>{line.sku}<b>× {line.qty}</b></small>)}</div>{item.containers.length > 0 && <small className="container-line">容器：{item.containers.join(', ')}</small>}<div className="side-total">总数 <strong>{item.totalQty}</strong></div></div>;
}
