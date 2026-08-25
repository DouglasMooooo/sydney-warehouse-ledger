import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { prepareReturnBatchPreview } from '../../../../../src/application/returnBatchPreview';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';
import { ExcelJsWorkbookReader, validateXlsxUpload, XlsxUploadError } from '../../../../../src/workOrders/excelJsReader';
import { parseReturnXlsxWorkbookData } from '../../../../../src/workOrders/returnXlsxParser';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/returns/preview');
  try {
    const auth = authenticateWarehouseRequest(request, 'RETURN_PREVIEW');
    log.setRole(auth.user.roles[0]);
    expensiveOperationLimiter.check(`return-xlsx:${auth.user.userId}`, 10, 60_000);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      return NextResponse.json(apiFailure('INVALID_REQUEST', '必须使用 multipart/form-data 上传 XLSX。'), { status: 400 });
    }
    const form = await request.formData();
    const businessDate = form.get('businessDate');
    const file = form.get('file');
    if (typeof businessDate !== 'string' || !businessDate.trim()) {
      return NextResponse.json(apiFailure('INVALID_REQUEST', '缺少 Sydney Business Date。', 'businessDate'), { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json(apiFailure('INVALID_REQUEST', '缺少 XLSX 文件。', 'file'), { status: 400 });
    }
    validateXlsxUpload(file.name, file.size);
    const workbook = await new ExcelJsWorkbookReader().read(new Uint8Array(await file.arrayBuffer()));
    const parsed = parseReturnXlsxWorkbookData(workbook, file.name);
    const preview = prepareReturnBatchPreview(parsed, businessDate.trim());
    log.success();
    return NextResponse.json(apiSuccess(preview));
  } catch (error) {
    const safe = error instanceof XlsxUploadError
      ? { code: error.code, message: error.message, field: 'file' }
      : clientSafeError(error);
    console.error('Return XLSX preview failed', serverSafeErrorSummary(error));
    log.failure(safe.code);
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401
      : safe.code === 'PERMISSION_DENIED' ? 403
        : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
