import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../src/application/apiResponse';
import { resolveWarehouseAuthContext } from '../../../../src/auth/authContext';
import { requireWarehousePermission } from '../../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../../src/ledger/businessDate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = resolveWarehouseAuthContext();
    requireWarehousePermission(auth, 'DASHBOARD_READ');
    return NextResponse.json(apiSuccess(await warehouseReadAdapterFromEnv().readDashboardSource(todayInSydney())));
  } catch (error) {
    console.error('Dashboard API failed', serverSafeErrorSummary(error));
    const safe = clientSafeError(error);
    return NextResponse.json(apiFailure(safe.code, safe.message), { status: httpStatus(safe.code) });
  }
}

function httpStatus(code: string): number {
  return code === 'AUTHENTICATION_REQUIRED' ? 401 : code === 'PERMISSION_DENIED' ? 403 : 503;
}
