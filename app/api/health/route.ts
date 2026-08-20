import { NextResponse } from 'next/server';
import { warehouseSheetReaderFromEnv } from '../../../src/feishu/sheetReader';
import { isReadOnlyRelease } from '../../../src/safety/readOnlyRelease';
import { operationalRequestLogger } from '../../../src/observability/requestLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = operationalRequestLogger(request, '/api/health');
  const authConfigured = Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET && process.env.FEISHU_OAUTH_REDIRECT_URI && process.env.WAREHOUSE_SESSION_SECRET);
  let ledgerRead: 'ok' | 'unavailable' = 'unavailable';
  try { ledgerRead = await warehouseSheetReaderFromEnv().healthCheck() ? 'ok' : 'unavailable'; } catch { /* safe status only */ }
  const ok = authConfigured && ledgerRead === 'ok' && isReadOnlyRelease();
  if (ok) log.success(); else log.failure('SERVICE_UNAVAILABLE');
  return NextResponse.json({ ok, version: process.env.APP_VERSION ?? '0.1.0', mode: 'read-only', services: { ledgerRead, auth: authConfigured ? 'ok' : 'unavailable' }, readOnlyRelease: isReadOnlyRelease() }, { status: ok ? 200 : 503 });
}
