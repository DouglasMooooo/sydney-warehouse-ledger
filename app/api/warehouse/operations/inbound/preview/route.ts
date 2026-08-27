import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../../src/application/apiResponse';
import { previewControlledBatchInbound, type ControlledBatchInboundInput } from '../../../../../../src/application/controlledLedgerOperation';
import { authenticateWarehouseRequest } from '../../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../../src/feishu/warehouseReadAdapter';
import { expensiveOperationLimiter } from '../../../../../../src/security/rateLimit';

export const runtime = 'nodejs';
export async function POST(request: Request) { try {
  const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_PREVIEW');
  expensiveOperationLimiter.check(`batch-inbound-preview:${auth.user.userId}`, 10, 60_000);
  return NextResponse.json(apiSuccess(await previewControlledBatchInbound(await request.json() as ControlledBatchInboundInput, warehouseReadAdapterFromEnv())));
} catch (error) { const safe=clientSafeError(error); console.error('Batch inbound preview failed',serverSafeErrorSummary(error)); return NextResponse.json(apiFailure(safe.code,safe.message,safe.field),{status:safe.code==='AUTHENTICATION_REQUIRED'?401:safe.code==='PERMISSION_DENIED'?403:400}); } }
