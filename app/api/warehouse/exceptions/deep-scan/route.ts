import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { runDeepQualityScan } from '../../../../../src/application/deepQualityScan';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/exceptions/deep-scan');
  try {
    const auth = authenticateWarehouseRequest(request, 'TASK_READ');
    log.setRole(auth.user.roles[0]);
    expensiveOperationLimiter.check(`deep:${auth.user.userId}`, 2, 5 * 60_000);
    const result = await runDeepQualityScan();
    log.success();
    return NextResponse.json(apiSuccess(result));
  } catch (error) {
    console.error('Deep quality scan failed', serverSafeErrorSummary(error));
    const safe = clientSafeError(error);
    log.failure(safe.code);
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 503;
    return NextResponse.json(apiFailure(safe.code, safe.message), { status });
  }
}
