import { NextResponse } from 'next/server';
import { apiFailure, apiSuccess, clientSafeError, serverSafeErrorSummary } from '../../../../../src/application/apiResponse';
import { parseWorkOrderPreviewClientDto } from '../../../../../src/application/clientDtos';
import { prepareWorkOrderPreview } from '../../../../../src/application/workOrderPreview';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { resolveWarehouseAuthContext } from '../../../../../src/auth/authContext';
import { requireWarehousePermission } from '../../../../../src/auth/permissions';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const auth = resolveWarehouseAuthContext();
    requireWarehousePermission(auth, 'WORK_ORDER_PREVIEW');
    const dto = parseWorkOrderPreviewClientDto(await request.json());
    const preview = await prepareWorkOrderPreview(dto, warehouseReadAdapterFromEnv());
    if (preview.errors.length > 0) {
      const first = preview.errors[0]!;
      return NextResponse.json(apiFailure(first.code, first.message), { status: 422 });
    }
    return NextResponse.json(apiSuccess(preview));
  } catch (error) {
    const safe = clientSafeError(error);
    console.error('Work order preview failed', serverSafeErrorSummary(error));
    return NextResponse.json(apiFailure(safe.code, safe.message, safe.field), {
      status: safe.code === 'AUTHENTICATION_REQUIRED' ? 401
        : safe.code === 'PERMISSION_DENIED' ? 403
          : safe.code === 'SYSTEM_READ_FAILED' ? 503 : 400,
    });
  }
}
