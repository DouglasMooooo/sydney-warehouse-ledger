import { NextResponse } from 'next/server';
import { apiFailure, clientSafeError, serverSafeErrorSummary } from '../application/apiResponse.js';
import { requestId } from '../observability/requestLog.js';
import { expensiveOperationLimiter } from '../security/rateLimit.js';
import { requireAiCapability, type AiCapability } from './capabilities.js';
import { authenticateAiPrincipal, type AiPrincipal } from './principal.js';
import type { AiProvenance, AiQueryResponse } from './provenance.js';
import { emitAiQueryAudit, type AiQueryType, type AiResponseStatus } from './queryAudit.js';
import { assertAiSafePayload } from './sanitize.js';
export { AiQueryError } from './errors.js';

export interface AiRouteResult<T> { data: T; provenance: AiProvenance; entityType?: string; entityId?: string; dataSources: string[]; responseStatus?: AiResponseStatus }
export interface AiRouteContext { request: Request; principal: AiPrincipal; requestId: string }
export interface AiQueryRouteOptions<T> { capability: AiCapability; queryType: AiQueryType; handler(context: AiRouteContext): Promise<AiRouteResult<T>> }

export function withAiQueryRoute<T>(options: AiQueryRouteOptions<T>) {
  return async function aiQueryRoute(request: Request): Promise<NextResponse> {
    const id = requestId(request), requestedAt = new Date().toISOString(), startedAt = Date.now();
    let principal: AiPrincipal | undefined;
    let status: AiResponseStatus = 'ERROR';
    let sources: string[] = [];
    let entityType: string | undefined, entityId: string | undefined;
    try {
      principal = authenticateAiPrincipal(request);
      requireAiCapability(principal, options.capability);
      expensiveOperationLimiter.check(`ai:${principal.principalId}:${options.capability}`, 60, 60_000);
      const result = await options.handler({ request, principal, requestId: id });
      status = result.responseStatus ?? 'SUCCESS'; sources = result.dataSources;
      entityType = result.entityType; entityId = result.entityId;
      const body: AiQueryResponse<T> = { data: result.data, provenance: result.provenance, requestId: id };
      assertAiSafePayload(body);
      const response = NextResponse.json(body, { status: status === 'NOT_FOUND' ? 404 : status === 'DEPENDENCY_PENDING' ? 503 : 200 });
      response.headers.set('Cache-Control','no-store');
      return response;
    } catch (error) {
      const code = errorCode(error);
      status = code === 'AI_CAPABILITY_REQUIRED' || code === 'AUTHENTICATION_REQUIRED' ? 'DENIED' : code === 'DEPENDENCY_PENDING' ? 'DEPENDENCY_PENDING' : 'ERROR';
      console.error('AI query failed', serverSafeErrorSummary(error));
      const safe = aiSafeError(error);
      return NextResponse.json(apiFailure(safe.code, safe.message), { status: httpStatus(safe.code) });
    } finally {
      emitAiQueryAudit({ requestId:id, requestedAt, principalId:principal?.principalId ?? 'unauthenticated',
        ...(principal?.userId ? { userId:principal.userId } : {}), capability:options.capability, queryType:options.queryType,
        ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}), dataSources:sources,
        responseStatus:status, durationMs:Math.max(0,Date.now()-startedAt) });
    }
  };
}

function errorCode(error: unknown): string { return typeof error === 'object' && error !== null && 'code' in error ? String((error as {code?:unknown}).code) : ''; }
function aiSafeError(error: unknown): {code:string;message:string} {
  const code = errorCode(error);
  if (code === 'AI_CAPABILITY_REQUIRED') return { code, message:'This AI principal does not have the required capability.' };
  if (code === 'UNSUPPORTED_QUERY') return { code, message:'The query cannot be mapped safely to a supported deterministic query.' };
  if (code === 'DEPENDENCY_PENDING') return { code, message:'The required deterministic data model is not available yet.' };
  if (code === 'NOT_FOUND') return { code, message:'The requested business entity was not found.' };
  if (code === 'INVALID_SH_REFERENCE') return { code, message:'The value is not a confirmed operational SH reference.' };
  return clientSafeError(error);
}
function httpStatus(code:string):number { return code==='AUTHENTICATION_REQUIRED'?401:code==='AI_CAPABILITY_REQUIRED'||code==='PERMISSION_DENIED'?403:code==='RATE_LIMITED'?429:code==='NOT_FOUND'?404:code==='DEPENDENCY_PENDING'||code==='SYSTEM_READ_FAILED'?503:400; }
