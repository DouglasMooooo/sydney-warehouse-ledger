import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';

export default function WorkOrdersPage() {
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">PREPARED · XLSX</p><h2>Work Order Preview</h2><p>服务端解析真实 ERP XLSX，并用当前飞书库存生成零写入预览。</p></div>
        <div className="preview-badge">Preview only · Zero writes</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
    </>
  );
}
