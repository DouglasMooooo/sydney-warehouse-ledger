import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { LiveInventoryQueryService } from '../../../../../src/application/queries/inventoryQueryService';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    authenticateWarehouseRequest(request, 'DASHBOARD_READ');
    const params = new URL(request.url).searchParams;
    const result = await new LiveInventoryQueryService(warehouseReadAdapterFromEnv()).search({
      ...(params.get('sku') ? { sku: params.get('sku')! } : {}),
      ...(params.get('model') ? { displayName: params.get('model')! } : {}),
      ...(params.get('location') ? { location: params.get('location')! } : {}),
      ...(params.get('condition') ? { stockCondition: params.get('condition')! } : {}),
    });
    return NextResponse.json(apiSuccess(result), { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Inventory query failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
