import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { isGoogleSheetsUatMode } from '../../../../../src/demo/visualDemo';
import { GoogleSheetsWriteTestClient, googleWriteTestConfigFromEnv, GoogleWriteTestUnavailableError } from '../../../../../src/googleSheets/writeTest';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';
import { expensiveOperationLimiter } from '../../../../../src/security/rateLimit';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/uat/write-test');
  try {
    if (!isGoogleSheetsUatMode()) throw new GoogleWriteTestUnavailableError('Google UAT mode is not active.');
    const auth = authenticateWarehouseRequest(request, 'GOOGLE_UAT_WRITE_TEST');
    log.setRole(auth.user.roles[0]);
    expensiveOperationLimiter.check(`google-write-test:${auth.user.userId}:${clientAddress(request)}`, 3, 60_000);
    const body = await safeJson(request);
    const result = await new GoogleSheetsWriteTestClient(googleWriteTestConfigFromEnv()).appendSmokeTest(body.remark ?? 'Vercel UAT 写入接口测试');
    log.success();
    return NextResponse.json(apiSuccess(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Google UAT write test failed', serverSafeErrorSummary(error));
    const code = error instanceof GoogleWriteTestUnavailableError ? error.code
      : hasCode(error, 'RATE_LIMITED') ? 'RATE_LIMITED'
        : hasCode(error, 'PERMISSION_DENIED') ? 'PERMISSION_DENIED'
          : 'WRITE_TEST_FAILED';
    log.failure(code);
    const status = code === 'WRITE_TEST_UNAVAILABLE' ? 503 : code === 'RATE_LIMITED' ? 429 : code === 'PERMISSION_DENIED' ? 403 : 502;
    const message = code === 'WRITE_TEST_UNAVAILABLE' ? '写入测试尚未配置 Google 服务账号。'
      : code === 'RATE_LIMITED' ? '写入测试过于频繁，请稍后再试。'
        : code === 'PERMISSION_DENIED' ? '当前用户无权执行写入测试。'
          : 'Google Sheet 写入测试失败。';
    return NextResponse.json(apiFailure(code, message), { status, headers: { 'Cache-Control': 'no-store' } });
  }
}

async function safeJson(request: Request): Promise<{ remark?: string }> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return {};
  const value = await request.json() as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid JSON body');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'remark') || (record.remark !== undefined && typeof record.remark !== 'string')) {
    throw new TypeError('Unsupported write-test field');
  }
  return record.remark === undefined ? {} : { remark: record.remark };
}

function clientAddress(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
