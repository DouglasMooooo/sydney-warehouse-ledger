import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { previewControlledLedgerOperation, type ControlledOperationInput } from '../../../../../src/application/controlledLedgerOperation';
import { INVENTORY_WORKFLOWS } from '../../../../../src/application/inventoryActionEngine';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import type { WarehousePermission } from '../../../../../src/auth/permissions';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as ControlledOperationInput & { action?: unknown };
    if (body.action !== undefined || !INVENTORY_WORKFLOWS.includes(body.workflow)) throw new TypeError('UNSUPPORTED_INVENTORY_WORKFLOW');
    const permission: WarehousePermission = body.workflow === 'MOVE' || body.workflow === 'REPAIR_COMPLETE' ? 'MOVE_PREVIEW'
      : body.workflow === 'ADJUST_INCREASE' || body.workflow === 'ADJUST_DECREASE' || body.workflow === 'OPENING_BALANCE'
        ? 'ADJUSTMENT_MANAGE' : body.workflow === 'RETURN_REPAIR' ? 'RETURN_PREVIEW' : 'WORK_ORDER_PREVIEW';
    const auth = authenticateWarehouseRequest(request, permission);
    expensiveOperationLimiter.check(`operation-preview:${auth.user.userId}`, 20, 60_000);
    return NextResponse.json(apiSuccess(await previewControlledLedgerOperation(body, warehouseReadAdapterFromEnv())));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Inventory workflow preview failed', serverSafeErrorSummary(error));
    const status = safe.code === 'AUTHENTICATION_REQUIRED' ? 401 : safe.code === 'PERMISSION_DENIED' ? 403 : safe.code === 'RATE_LIMITED' ? 429 : 400;
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), { status });
  }
}
