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
    requireWarehousePermission(auth, 'TASK_READ');
    return NextResponse.json(apiSuccess(warehouseReadAdapterFromEnv().readTodayTasks(todayInSydney())));
  } catch (error) {
    console.error('Task API failed', serverSafeErrorSummary(error));
    const safe = clientSafeError(error);
    return NextResponse.json(apiFailure(safe.code, safe.message), { status: safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : 503 });
  }
}
