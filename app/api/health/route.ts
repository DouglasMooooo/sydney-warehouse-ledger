import { NextResponse } from 'next/server';
import { operationalRequestLogger } from '../../../src/observability/requestLog';
import { getReadinessSnapshot } from '../../../src/application/readinessService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const log = operationalRequestLogger(request, '/api/health');
  const snapshot = await getReadinessSnapshot();
  if (snapshot.ok) log.success(); else log.failure('SERVICE_UNAVAILABLE');
  return NextResponse.json(snapshot, { status: snapshot.ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
