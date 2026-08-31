import { Suspense } from 'react';
import { todayInSydney, type BusinessDate } from '../../../src/ledger/businessDate';
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
  const adapter = warehouseReadAdapterFromEnv();
  const businessDate = todayInSydney();
  return <><header className="console-header"><div><h2>库存作业 <small>扫码批量处理</small></h2><p>先导入 SN，再从仓库图选择目标库位；系统逐台校验后统一确认。</p></div><div className="write-live">READ → VALIDATE → PREVIEW → CONFIRM → WRITE → VERIFY</div></header><Suspense fallback={<OperationsLoading />}><OperationsData adapter={adapter} businessDate={businessDate} canAdjust={canAdjust}/></Suspense></>;
}

async function OperationsData({ adapter, businessDate, canAdjust }: { adapter: ReturnType<typeof warehouseReadAdapterFromEnv>; businessDate: BusinessDate; canAdjust: boolean }) {
  try {
    if (process.env.WAREHOUSE_DESIGN_FIXTURE === 'true') return <OperationsClient businessDate={businessDate} canAdjust={canAdjust} locations={warehouseDesignFixture()} awaitingPickup={[]}/>;
    const bootstrap = await adapter.readOperationsBootstrap(businessDate);
    return <OperationsClient businessDate={businessDate} canAdjust={canAdjust} locations={bootstrap.locations} awaitingPickup={bootstrap.awaitingPickup}/>;
  } catch (error) {
    const safe = clientSafeError(error);
    return <div className="notice error"><strong>业务操作暂不可用</strong><br />{safe.code} · {safe.message}</div>;
  }
}

function OperationsLoading() {
  return <div className="workflow-loading" role="status"><span className="loading-pulse"/><div><strong>正在同步库存作业台</strong><small>读取库位与待取货任务，完成后即可操作。</small></div></div>;
}
