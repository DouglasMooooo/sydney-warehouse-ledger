import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';
import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { isGoogleSheetsUatMode } from '../../../src/demo/visualDemo';
import { GoogleWriteTestClient } from './write-test-client';

export const dynamic = 'force-dynamic';

export default async function WorkOrdersPage() {
  try { await authenticateWarehousePage('WORK_ORDER_PREVIEW'); }
  catch { return <div className="notice error">当前账号未获得仓库系统权限</div>; }
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">PREPARED · XLSX</p><h2>Work Order Preview</h2><p>服务端解析 ERP XLSX，并用当前{isGoogleSheetsUatMode() ? ' Google Sheet' : '飞书'}库存生成零写入预览。</p></div>
        <div className="preview-badge">Preview only · Zero writes</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
      {isGoogleSheetsUatMode() && <GoogleWriteTestClient />}
    </>
  );
}
