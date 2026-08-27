import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { executeControlledLedgerOperation, type ControlledOperationInput } from '../../../../../src/application/controlledLedgerOperation';
import { INVENTORY_WORKFLOWS } from '../../../../../src/application/inventoryActionEngine';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import type { WarehousePermission } from '../../../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as ControlledOperationInput;
    if ('action' in body || !INVENTORY_WORKFLOWS.includes(body.workflow)) throw new TypeError('UNSUPPORTED_INVENTORY_WORKFLOW');
    const permission: WarehousePermission = body.workflow === 'MOVE' || body.workflow === 'REPAIR_COMPLETE' ? 'MOVE_CONFIRM'
      : body.workflow === 'ADJUST_INCREASE' || body.workflow === 'ADJUST_DECREASE' || body.workflow === 'OPENING_BALANCE'
        ? 'ADJUSTMENT_MANAGE' : body.workflow === 'RETURN_REPAIR' ? 'RETURN_CONFIRM' : 'WORK_ORDER_CONFIRM';
    const auth = authenticateWarehouseRequest(request, permission);
    expensiveOperationLimiter.check(`write:${auth.user.userId}`, 8, 60_000);
    const result = await executeControlledLedgerOperation(body, warehouseReadAdapterFromEnv(), openApiLedgerWriterFromEnv(), process.env, { createdBy: auth.user.userId });
    return NextResponse.json(apiSuccess(result));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Controlled ledger write failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
