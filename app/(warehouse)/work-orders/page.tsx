import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';

export default function WorkOrdersPage() {
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">PREPARED · ITERATION 1</p><h2>工单 / 备货</h2><p>解析 Replacement、验证真实库存并生成只读 Prepared 预览。</p></div>
        <div className="preview-badge">Preview only · Zero writes</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
    </>
  );
}
