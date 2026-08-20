import { todayInSydney } from '../../../src/ledger/businessDate';
import { WorkOrderPreviewClient } from './preview-client';

export default function WorkOrdersPage() {
  return (
    <>
      <header className="page-header">
        <div><p className="eyebrow">PREPARED · REVIEW FIX</p><h2>Work Order Preview Prototype</h2><p>文本原型仅解析明确的 Replacement Unit information 区段；尚未启用真实 ERP XLSX 上传。</p></div>
        <div className="preview-badge">Preview only · Zero writes</div>
      </header>
      <WorkOrderPreviewClient initialBusinessDate={todayInSydney()} />
    </>
  );
}
