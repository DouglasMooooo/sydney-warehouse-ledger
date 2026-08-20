import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../src/application/apiResponse';
import { authenticateWarehouseRequest } from '../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../../src/ledger/businessDate';
import { operationalRequestLogger } from '../../../../src/observability/requestLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/dashboard');
  try {
    const auth = authenticateWarehouseRequest(request, 'DASHBOARD_READ'); log.setRole(auth.user.roles[0]);
    const response = NextResponse.json(apiSuccess(await warehouseReadAdapterFromEnv().readDashboardSource(todayInSydney()))); log.success(); return response;
  } catch (error) {
    console.error('Dashboard API failed', serverSafeErrorSummary(error));
    const safe = clientSafeError(error);
    log.failure(safe.code);
    return NextResponse.json(apiFailure(safe.code, safe.message), { status: httpStatus(safe.code) });
  }
}

function httpStatus(code: string): number {
  return code === 'AUTHENTICATION_REQUIRED' ? 401 : code === 'PERMISSION_DENIED' ? 403 : 503;
}
