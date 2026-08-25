import { NextResponse } from 'next/server';
import { apiFailure,apiSuccess,clientSafeError,serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { confirmPreparedWorkOrder,type PreparedConfirmInput } from '../../../../../src/application/confirmPreparedWorkOrder';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { openApiLedgerWriterFromEnv } from '../../../../../src/feishu/openApiLedgerWriter';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';
export const runtime='nodejs';
export async function POST(request:Request){try{const auth=authenticateWarehouseRequest(request,'WORK_ORDER_CONFIRM');expensiveOperationLimiter.check(`prepared:${auth.user.userId}`,5,60_000);const body=await request.json() as PreparedConfirmInput;const result=await confirmPreparedWorkOrder(body,warehouseReadAdapterFromEnv(),openApiLedgerWriterFromEnv());return NextResponse.json(apiSuccess(result));}catch(error){const safe=clientSafeError(error);console.error('Prepared confirmation failed',serverSafeErrorSummary(error));const status=safe.code==='AUTHENTICATION_REQUIRED'?401:safe.code==='PERMISSION_DENIED'?403:safe.code==='RATE_LIMITED'?429:400;return NextResponse.json(apiFailure(safe.code,safe.message,safe.field),{status});}}
