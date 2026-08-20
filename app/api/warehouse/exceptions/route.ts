import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../src/application/apiResponse';
import { authenticateWarehouseRequest } from '../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { operationalRequestLogger } from '../../../../src/observability/requestLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/exceptions');
  try {
    const auth = authenticateWarehouseRequest(request, 'TASK_READ'); log.setRole(auth.user.roles[0]);
    const response = NextResponse.json(apiSuccess(await warehouseReadAdapterFromEnv().readOperationalExceptions())); log.success(); return response;
  } catch (error) {
    console.error('Exception API failed', serverSafeErrorSummary(error));
    const safe = clientSafeError(error);
    log.failure(safe.code);
    return NextResponse.json(apiFailure(safe.code, safe.message), { status: safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : 503 });
  }
}
