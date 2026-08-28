import { NextResponse } from 'next/server';
import { operationalRequestLogger } from '../../../src/observability/requestLog';
import { getReadinessSnapshot } from '../../../src/application/readinessService';
import { getDeploymentMode, getFeatureFlags } from '../../../src/config/featureFlags';
import { logFeishuOpenApiReadDiagnostic, runFeishuOpenApiReadDiagnostic } from '../../../src/uat/feishuOpenApiDiagnostic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = operationalRequestLogger(request, '/api/health');
  if (process.env.FEISHU_OPENAPI_DIAGNOSTIC === 'true') {
    const entries = await runFeishuOpenApiReadDiagnostic();
    logFeishuOpenApiReadDiagnostic(entries);
  }
  const snapshot = await getReadinessSnapshot();
  if (snapshot.ok) log.success(); else log.failure('SERVICE_UNAVAILABLE');
  const flags=getFeatureFlags(),mode=getDeploymentMode();
  return NextResponse.json({ ...snapshot, deploymentMode:mode, features:{warehouseOperations:flags.warehouseOperations,aiReadQueries:flags.aiReadQueries,migrationStatusRead:flags.migrationStatusRead,migrationPersistence:flags.migrationPersistence,authoritativeSnApi:flags.authoritativeSnApi,movementRegistryWrite:flags.movementRegistryWrite} }, { status: snapshot.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
