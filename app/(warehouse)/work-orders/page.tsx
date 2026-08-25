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
        <div><h2>更换件信息提取 <small>仅 Replacement Information</small></h2><p>导入真实 RMA 工单，核对当前飞书库存与推荐库位。</p></div>
        <div className="readonly-lock">UAT 环境 · 所有写入已锁定</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
    </>
  );
}
