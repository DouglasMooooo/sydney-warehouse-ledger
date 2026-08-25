import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { prepareReturnSnBatchPreview } from '../../../../../src/application/returnBatchPreview';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { todayInSydney } from '../../../../../src/ledger/businessDate';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/returns/preview');
  try {
    const auth = authenticateWarehouseRequest(request, 'RETURN_PREVIEW');
    log.setRole(auth.user.roles[0]);
    expensiveOperationLimiter.check(`return-sn:${auth.user.userId}`, 10, 60_000);
    const body = await request.json() as { sns?: unknown };
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'sns')) {
      throw new TypeError('请求只能包含 sns。');
    }
    const preview = prepareReturnSnBatchPreview(body.sns, todayInSydney());
    log.success();
    return NextResponse.json(apiSuccess(preview), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Return SN preview failed', serverSafeErrorSummary(error));
    log.failure(safe.code);
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401
      : safe.code === 'PERMISSION_DENIED' ? 403
        : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
