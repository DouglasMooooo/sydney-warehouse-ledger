import { NextResponse } from 'next/server';
import { apiFailure,apiSuccess,clientSafeError,serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { answerWarehouseQuestion } from '../../../../../src/application/warehouseAiRead';
import { authenticateAiReadRequest } from '../../../../../src/auth/aiReadAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { todayInSydney } from '../../../../../src/ledger/businessDate';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){const log=operationalRequestLogger(request,'/api/warehouse/ai/query');try{const auth=authenticateAiReadRequest(request);if(auth.role)log.setRole(auth.role);expensiveOperationLimiter.check(auth.limiterKey,30,60_000);const body=await request.json() as {question?:unknown};const snapshot=await warehouseReadAdapterFromEnv().readDashboardSource(todayInSydney());const response=NextResponse.json(apiSuccess(answerWarehouseQuestion(body.question,snapshot)));response.headers.set('Cache-Control','no-store');log.success();return response;}catch(error){console.error('Warehouse AI read query failed',serverSafeErrorSummary(error));const safe=clientSafeError(error);log.failure(safe.code);return NextResponse.json(apiFailure(safe.code,safe.code==='INVALID_REQUEST'?'仅支持库存属性、库位、今日作业、待取货和异常数量问题。':safe.message),{status:safe.code==='AUTHENTICATION_REQUIRED'?401:safe.code==='PERMISSION_DENIED'?403:safe.code==='RATE_LIMITED'?429:safe.code==='SYSTEM_READ_FAILED'?503:400});}}
