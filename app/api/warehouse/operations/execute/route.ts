import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { executeControlledLedgerOperation, CONTROLLED_UAT_ACTIONS, type ControlledOperationInput } from '../../../../../src/application/controlledLedgerOperation';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import type { WarehousePermission } from '../../../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as ControlledOperationInput;
    if (!CONTROLLED_UAT_ACTIONS.includes(body.action)) throw new TypeError('UNSUPPORTED_CONTROLLED_ACTION');
    const permission: WarehousePermission = body.action === '移库' ? 'MOVE_CONFIRM'
      : body.action === '库存调增' || body.action === '库存调减' ? 'ADJUSTMENT_MANAGE' : 'WORK_ORDER_CONFIRM';
    const auth = authenticateWarehouseRequest(request, permission);
    expensiveOperationLimiter.check(`write:${auth.user.userId}`, 8, 60_000);
    const result = await executeControlledLedgerOperation(body, warehouseReadAdapterFromEnv(), openApiLedgerWriterFromEnv());
    return NextResponse.json(apiSuccess(result));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Controlled ledger write failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
