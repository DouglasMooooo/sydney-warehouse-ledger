import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { confirmBatchOutbound, previewBatchOutbound, type BatchOutboundInput } from '../../../../../src/application/batchOutbound';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as BatchOutboundInput & { mode?: 'preview' | 'confirm' };
    const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_CONFIRM');
    expensiveOperationLimiter.check(`batch-outbound:${auth.user.userId}`, 8, 60_000);
    const adapter = warehouseReadAdapterFromEnv();
    const result = body.mode === 'confirm'
      ? await confirmBatchOutbound(body, adapter, openApiLedgerWriterFromEnv())
      : await previewBatchOutbound(body, adapter);
    return NextResponse.json(apiSuccess(result));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Batch outbound failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
