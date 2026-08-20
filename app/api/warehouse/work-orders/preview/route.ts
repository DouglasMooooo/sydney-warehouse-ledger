import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { prepareParsedWorkOrderBatchPreview } from '../../../../../src/application/workOrderBatchPreview';
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
    const file = form.get('file');
    if (typeof businessDate !== 'string' || !businessDate.trim()) {
      log.failure('INVALID_REQUEST');
      return NextResponse.json(apiFailure('INVALID_REQUEST', '缺少 Sydney Business Date。', 'businessDate'), { status: 400 });
    }
    if (!(file instanceof File)) {
      log.failure('INVALID_REQUEST');
      return NextResponse.json(apiFailure('INVALID_REQUEST', '缺少 XLSX 文件。', 'file'), { status: 400 });
    }
    validateXlsxUpload(file.name, file.size);
    const parsed = await new XlsxWorkOrderParser(new ExcelJsWorkbookReader()).parse({
      bytes: new Uint8Array(await file.arrayBuffer()), sourceFileName: file.name,
    });
    const preview = await prepareParsedWorkOrderBatchPreview(parsed, businessDate.trim(), warehouseReadAdapterFromEnv());
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
