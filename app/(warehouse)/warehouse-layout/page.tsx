import { MapPinLine } from '@phosphor-icons/react/dist/ssr';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { WarehouseMatrix } from './warehouse-matrix';
import { warehouseDesignFixture } from '../../../src/application/warehouseDesignFixture';

export const dynamic = 'force-dynamic';

export default async function WarehouseLayoutPage() {
  try {
    await authenticateWarehousePage('INVENTORY_READ');
    const snapshot=process.env.WAREHOUSE_DESIGN_FIXTURE==='true'?{locations:warehouseDesignFixture(),issues:[]}:await warehouseReadAdapterFromEnv().readLocationSummaries();
    return <><header className="console-header matrix-page-header"><div><h2>仓库现场图 <small>实时库位库存</small></h2><p>绿色为空位，红色为占用；混装库位会直接显示警示。</p></div><div className="live-badge"><MapPinLine size={16}/>当前库存实时派生</div></header><div className="matrix-page"><WarehouseMatrix locations={snapshot.locations}/>{snapshot.issues.length>0&&<div className="notice error">{snapshot.issues.length} 条异常库存没有被计入现场图。</div>}</div></>;
  } catch { return <><header className="console-header"><div><h2>仓库现场图</h2></div></header><div className="notice error">身份、权限或当前库存读取失败。</div></>; }
}
