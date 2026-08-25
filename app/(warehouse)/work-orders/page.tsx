import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';

export const dynamic = 'force-dynamic';

export default async function WorkOrdersPage() {
  try { await authenticateWarehousePage('WORK_ORDER_PREVIEW'); }
  catch { return <div className="notice error">当前账号未获得仓库系统权限</div>; }
  return (
    <>
      <header className="console-header">
        <div><h2>库存操作台 <small>工单备货</small></h2><p>导入工单后自动生成取件码；仓库人员填写 SN，并现场确认最终库位。</p></div>
        <div className="readonly-lock">UAT 环境 · 所有写入已锁定</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
    </>
  );
}
