import { todayInSydney } from '../../../src/ledger/businessDate';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { OperationsClient } from './operations-client';
import { hasWarehousePermission } from '../../../src/auth/permissions';
export default async function Page() {
  let auth;
  try { auth = await authenticateWarehousePage('MOVE_CONFIRM'); } catch { return <div className="notice error">当前账号没有库存事务权限。</div>; }
  const canAdjust = hasWarehousePermission(auth.user.roles, 'ADJUSTMENT_MANAGE');
  return <><header className="console-header"><div><h2>库存作业 <small>业务流程驱动</small></h2><p>选择员工理解的业务流程；底层库存动作由系统自动决定。</p></div><div className="write-live">READ → VALIDATE → PREVIEW → CONFIRM → WRITE → VERIFY</div></header><OperationsClient businessDate={todayInSydney()} canAdjust={canAdjust}/></>;
}
