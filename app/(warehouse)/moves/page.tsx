import { todayInSydney } from '../../../src/ledger/businessDate';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { OperationsClient } from './operations-client';
import { hasWarehousePermission } from '../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../src/feishu/warehouseReadAdapter';
import { warehouseDesignFixture } from '../../../src/application/warehouseDesignFixture';
import { clientSafeError } from '../../../src/application/apiResponse';
export default async function Page() {
  let auth;
  try { auth = await authenticateWarehousePage('MOVE_CONFIRM'); } catch { return <div className="notice error">当前账号没有库存事务权限。</div>; }
  const canAdjust = hasWarehousePermission(auth.user.roles, 'ADJUSTMENT_MANAGE');
  const adapter=warehouseReadAdapterFromEnv(); const businessDate=todayInSydney();
  let locations: Awaited<ReturnType<typeof warehouseDesignFixture>>; let tasks: { awaitingPickup: never[] } | Awaited<ReturnType<typeof adapter.readTodayTasks>>;
  try {
    if (process.env.WAREHOUSE_DESIGN_FIXTURE==='true') {
      locations = warehouseDesignFixture();
      tasks = { awaitingPickup: [] };
    } else {
      // These are independent read-only Feishu calls; run them concurrently so
      // opening the operations console does not pay both network round trips.
      const [locationSummary, todayTasks] = await Promise.all([
        adapter.readLocationSummaries(),
        adapter.readTodayTasks(businessDate),
      ]);
      locations = locationSummary.locations;
      tasks = todayTasks;
    }
  } catch (error) {
    const safe = clientSafeError(error);
    return <div className="notice error"><strong>业务操作暂不可用</strong><br />{safe.code} · {safe.message}</div>;
  }
  return <><header className="console-header"><div><h2>库存作业 <small>扫码批量处理</small></h2><p>先导入 SN，再从仓库图选择目标库位；系统逐台校验后统一确认。</p></div><div className="write-live">READ → VALIDATE → PREVIEW → CONFIRM → WRITE → VERIFY</div></header><OperationsClient businessDate={businessDate} canAdjust={canAdjust} locations={locations} awaitingPickup={tasks.awaitingPickup}/></>;
}
