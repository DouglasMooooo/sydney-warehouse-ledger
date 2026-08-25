import { todayInSydney } from '../../../src/ledger/businessDate';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { OperationsClient } from './operations-client';
export default async function Page() {
  try { await authenticateWarehousePage('MOVE_CONFIRM'); } catch { return <div className="notice error">当前账号没有库存事务权限。</div>; }
  return <><header className="console-header"><div><h2>库存事务 <small>受控 UAT 写入</small></h2><p>入库、出库、移库、库存调增与调减。出库继续执行严格工单校验。</p></div><div className="write-live">写入已开放 · 每笔写后复核</div></header><OperationsClient businessDate={todayInSydney()}/></>;
}
