import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { parseWorkOrderPreviewClientDto } from '../../../../../src/application/clientDtos';
import { prepareWorkOrderPreview } from '../../../../../src/application/workOrderPreview';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { authenticateWarehouseRequest } from '../../../../../src/auth/requestAuth';
import { operationalRequestLogger } from '../../../../../src/observability/requestLog';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const log = operationalRequestLogger(request, '/api/warehouse/work-orders/prepare');
  try {
    const auth = authenticateWarehouseRequest(request, 'WORK_ORDER_PREVIEW');
    log.setRole(auth.user.roles[0]);
    const dto = parseWorkOrderPreviewClientDto(await request.json());
    const preview = await prepareWorkOrderPreview(dto, warehouseReadAdapterFromEnv());
    if (preview.errors.length > 0) {
      const first = preview.errors[0]!;
      log.failure(first.code);
      return NextResponse.json(apiFailure(first.code, first.message), { status: 422 });
    }
    log.success();
    return NextResponse.json(apiSuccess(preview));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Work order preview failed', serverSafeErrorSummary(error));
    log.failure(safe.code);
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), {
      status: safe.code === 'AUTHENTICATION_REQUIRED' ? 401
        : safe.code === 'PERMISSION_DENIED' ? 403
          : safe.code === 'SYSTEM_READ_FAILED' ? 503 : 400,
    });
  }
}
