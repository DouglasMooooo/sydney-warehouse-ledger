import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../../src/application/apiResponse';
import { executeControlledBatchInbound, type ControlledBatchInboundInput } from '../../../../../../src/application/controlledLedgerOperation';
import { authenticateWarehouseRequest } from '../../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../../src/security/rateLimit';

export const runtime = 'nodejs';
export async function POST(request: Request) { try {
  const body=await request.json() as ControlledBatchInboundInput; if(!body.commandId) throw new TypeError('MISSING_COMMAND_ID');
  const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_CONFIRM');
  expensiveOperationLimiter.check(`batch-inbound-write:${auth.user.userId}`, 5, 60_000);
  return NextResponse.json(apiSuccess(await executeControlledBatchInbound(body,warehouseReadAdapterFromEnv(),openApiLedgerWriterFromEnv(),process.env,{createdBy:auth.user.userId,commandId:body.commandId})));
} catch (error) { const safe=clientSafeError(error); console.error('Batch inbound write failed',serverSafeErrorSummary(error)); return NextResponse.json(apiFailure(safe.code,safe.message,safe.field),{status:safe.code==='AUTHENTICATION_REQUIRED'?401:safe.code==='PERMISSION_DENIED'?403:400}); } }
