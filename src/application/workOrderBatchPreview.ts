import type { WarehouseReadPort } from './contracts.js';
import { prepareWorkOrderPreview, type WorkOrderPreview, type WorkOrderPreviewError } from './workOrderPreview.js';
import type { ParsedWorkOrder } from '../workOrders/types.js';

export interface WorkOrderLinePreview {
  sourceRow?: number;
  preview: WorkOrderPreview;
}

export interface WorkOrderBatchPreview {
  mode: 'PREVIEW_ONLY';
  zeroWritesPerformed: true;
  sourceFileName?: string;
  sh?: string;
  lines: WorkOrderLinePreview[];
  errors: WorkOrderPreviewError[];
  warnings: string[];
}

export async function prepareParsedWorkOrderBatchPreview(
  parsed: ParsedWorkOrder,
  businessDate: string,
  port: WarehouseReadPort,
): Promise<WorkOrderBatchPreview> {
  const base: WorkOrderBatchPreview = {
    mode: 'PREVIEW_ONLY', zeroWritesPerformed: true, lines: [], errors: [], warnings: [...parsed.warnings],
  };
  if (parsed.sourceFileName) base.sourceFileName = parsed.sourceFileName;
  if (parsed.shNo) base.sh = parsed.shNo;
  if (parsed.confidence !== 'high' || parsed.replacementLines.length === 0 || !parsed.shNo) {
    base.errors.push({
      code: 'REPLACEMENT_NOT_CLEAR',
      message: 'XLSX Replacement Unit information 无法可靠解析；未生成 Prepared 预览。',
    });
    return base;
  }
  for (const line of parsed.replacementLines) {
    const preview = await prepareWorkOrderPreview({
      businessDate,
      sourceText: [
        `SH: ${parsed.shNo}`,
        'Replacement Unit information',
        `SKU: ${line.sku}`,
        `Qty: ${line.qty}`,
        `ERP Warehouse: ${line.erpWarehouse}`,
      ].join('\n'),
      ...(parsed.sourceFileName ? { sourceFileName: parsed.sourceFileName.replace(/\.xlsx$/i, '.decoded.txt') } : {}),
    }, port);
    const item: WorkOrderLinePreview = { preview };
    if (line.sourceRow !== undefined) item.sourceRow = line.sourceRow;
    base.lines.push(item);
    base.errors.push(...preview.errors);
  }
  if (base.lines.length > 1) {
    base.warnings.push('多 Replacement 行分别显示；本阶段只读，不能确认或写入。');
  }
  return base;
}
