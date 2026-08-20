import { NextResponse } from 'next/server';
import { parseWorkOrderPreviewClientDto } from '../../../../../src/application/clientDtos';
import { prepareWorkOrderPreview } from '../../../../../src/application/workOrderPreview';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const dto = parseWorkOrderPreviewClientDto(await request.json());
    const preview = await prepareWorkOrderPreview(dto, warehouseReadAdapterFromEnv());
    return NextResponse.json(preview, { status: preview.errors.length > 0 ? 422 : 200 });
  } catch (error) {
    const message = String(error);
    if (message.includes('UNSUPPORTED_CLIENT_FIELD') || error instanceof TypeError) {
      return NextResponse.json({ error: `数据格式错误: ${message}` }, { status: 400 });
    }
    console.error('Work order preview failed', error);
    return NextResponse.json({ error: 'SYSTEM_READ_FAILED' }, { status: 503 });
  }
}
