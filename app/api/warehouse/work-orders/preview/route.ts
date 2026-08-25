import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { prepareParsedWorkOrderBatchPreview, type MultiFileWorkOrderPreview } from '../../../../../src/application/workOrderBatchPreview';
import { nextPickupCode } from '../../../../../src/application/workOrderPreview';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { ExcelJsWorkbookReader, validateXlsxUpload, XlsxUploadError } from '../../../../../src/workOrders/excelJsReader';
import { XlsxWorkOrderParser } from '../../../../../src/workOrders/xlsxParser';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/work-orders/preview');
  try {
    const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_PREVIEW');
    log.setRole(auth.user.roles[0]);
    expensiveOperationLimiter.check(`xlsx:${auth.user.userId}`, 10, 60_000);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      log.failure('INVALID_REQUEST');
      return NextResponse.json(apiFailure('INVALID_REQUEST', '必须使用 multipart/form-data 上传 XLSX。'), { status: 400 });
    }
    const form = await request.formData();
    const businessDate = form.get('businessDate');
    const files = [...form.getAll('files'), form.get('file')].filter((item): item is File => item instanceof File && item.size > 0);
    if (typeof businessDate !== 'string' || !businessDate.trim()) {
      log.failure('INVALID_REQUEST');
      return NextResponse.json(apiFailure('INVALID_REQUEST', '缺少 Sydney Business Date。', 'businessDate'), { status: 400 });
    }
    if (!files.length || files.length > 20) {
      log.failure('INVALID_REQUEST');
      return NextResponse.json(apiFailure('INVALID_REQUEST', '请选择 1–20 个 XLSX 文件。', 'files'), { status: 400 });
    }
    const adapter = warehouseReadAdapterFromEnv();
    const documents = [];
    for (const file of files) {
      validateXlsxUpload(file.name, file.size);
      const parsed = await new XlsxWorkOrderParser(new ExcelJsWorkbookReader()).parse({
        bytes: new Uint8Array(await file.arrayBuffer()), sourceFileName: file.name,
      });
      documents.push(await prepareParsedWorkOrderBatchPreview(parsed, businessDate.trim(), adapter));
    }
    const pickupCodes = await adapter.readPickupCodes();
    for (const document of documents) {
      if (!document.sh || document.errors.length || !document.lines.length) continue;
      const pickupCode = nextPickupCode(pickupCodes);
      if (!pickupCode) break;
      pickupCodes.push(pickupCode);
      for (const line of document.lines) {
        if (!line.preview.proposedPreparedRow) continue;
        line.preview.pickupCode = { value: pickupCode, committed: false, label: 'Preview / not yet committed' };
        line.preview.proposedPreparedRow.pickupCode = pickupCode;
      }
    }
    const preview: MultiFileWorkOrderPreview = { mode:'PREVIEW_ONLY', zeroWritesPerformed:true, documents,
      summary:{files:documents.length,workOrders:documents.filter(item=>item.sh).length,
        lines:documents.reduce((sum,item)=>sum+item.lines.length,0),errors:documents.reduce((sum,item)=>sum+item.errors.length,0)} };
    log.success();
    return NextResponse.json(apiSuccess(preview));
  } catch (error) {
    const safe = error instanceof XlsxUploadError
      ? { code: error.code, message: error.message, field: 'file' }
      : clientSafeError(error);
    console.error('Work order XLSX preview failed', serverSafeErrorSummary(error));
    log.failure(safe.code);
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401
      : safe.code === 'PERMISSION_DENIED' ? 403
        : safe.code === 'RATE_LIMITED' ? 429
          : safe.code === 'SYSTEM_READ_FAILED' ? 503 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
