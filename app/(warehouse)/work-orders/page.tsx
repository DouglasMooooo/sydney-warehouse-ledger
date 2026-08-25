import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { warehouseDesignFixture } from '../../../src/application/warehouseDesignFixture';

export const dynamic = 'force-dynamic';

export default async function WorkOrdersPage() {
  let locations;
  try { await authenticateWarehousePage('WORK_ORDER_PREVIEW'); locations = process.env.WAREHOUSE_DESIGN_FIXTURE==='true'?warehouseDesignFixture():(await warehouseReadAdapterFromEnv().readLocationSummaries()).locations; }
  catch { return <div className="notice error">当前账号未获得仓库系统权限</div>; }
  return (
    <>
      <header className="console-header">
        <div><h2>库存操作台 <small>工单备货</small></h2><p>导入工单后自动生成取件码；仓库人员填写 SN，并现场确认最终库位。</p></div>
        <div className="write-live">UAT 受控写入 · 人工确认后生效</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} locations={locations} />
    </>
  );
}
