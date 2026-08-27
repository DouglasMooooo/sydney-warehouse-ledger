import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { confirmOutboundReversal, previewOutboundReversal, type OutboundReversalInput } from '../../../../../src/application/outboundReversal';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { openApiLedgerWriterFromEnv } from '../../../../../src/feishu/openApiLedgerWriter';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as OutboundReversalInput & { mode?: 'preview' | 'confirm' };
    const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_CONFIRM');
    expensiveOperationLimiter.check(`outbound-reversal:${auth.user.userId}`, 6, 60_000);
    const adapter = warehouseReadAdapterFromEnv();
    const result = body.mode === 'confirm'
      ? await confirmOutboundReversal(body, adapter, openApiLedgerWriterFromEnv(), process.env, { createdBy: auth.user.userId })
      : await previewOutboundReversal(body, adapter);
    return NextResponse.json(apiSuccess(result));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Outbound reversal failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
