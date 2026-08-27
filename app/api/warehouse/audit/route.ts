import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../src/application/apiResponse';
import { LiveLedgerAuditService } from '../../../../src/application/auditQueryService';
import { authenticateWarehouseRequest } from '../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authenticateWarehouseRequest(request, 'TASK_READ');
    const params = new URL(request.url).searchParams;
    const shNo = params.get('sh') ?? undefined, sn = params.get('sn') ?? undefined;
    const fromDate = params.get('from') ?? undefined, toDate = params.get('to') ?? undefined;
    const limit = params.get('limit') ? Number(params.get('limit')) : undefined;
    const result = await new LiveLedgerAuditService(warehouseReadAdapterFromEnv()).search({
      ...(shNo ? { shNo } : {}), ...(sn ? { sn } : {}),
      ...(fromDate ? { fromDate } : {}), ...(toDate ? { toDate } : {}), ...(limit !== undefined ? { limit } : {}),
    });
    return NextResponse.json(apiSuccess(result), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Ledger audit query failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
