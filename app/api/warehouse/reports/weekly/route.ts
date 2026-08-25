import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { parseBusinessDateString, todayInSydney } from '../../../../../src/ledger/businessDate';

export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
export async function GET(request: Request) { try { authenticateWarehouseRequest(request,'DASHBOARD_READ'); const date=parseBusinessDateString(new URL(request.url).searchParams.get('date'))??todayInSydney(); return NextResponse.json(apiSuccess(await warehouseReadAdapterFromEnv().readWeeklyReport(date))); } catch(error){const safe=clientSafeError(error);console.error('Weekly report failed',serverSafeErrorSummary(error));return NextResponse.json(apiFailure(safe.code,safe.message),{status:safe.code==='AUTHENTICATION_REQUIRED'?401:safe.code==='PERMISSION_DENIED'?403:503});} }
