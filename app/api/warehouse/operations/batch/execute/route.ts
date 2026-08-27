import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../../src/application/apiResponse';
import { executeControlledBatchTransfer, type ControlledBatchTransferInput } from '../../../../../../src/application/controlledLedgerOperation';
import { authenticateWarehouseRequest } from '../../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as ControlledBatchTransferInput;
    const auth = authenticateWarehouseRequest(request, 'MOVE_CONFIRM');
    expensiveOperationLimiter.check(`batch-transfer-write:${auth.user.userId}`, 5, 60_000);
    return NextResponse.json(apiSuccess(await executeControlledBatchTransfer(body, warehouseReadAdapterFromEnv(), openApiLedgerWriterFromEnv(), process.env, { createdBy: auth.user.userId })));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Batch transfer write failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
