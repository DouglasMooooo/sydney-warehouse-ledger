import type { WarehouseReadPort } from './contracts.js';
import type { OpenApiLedgerWriter, ConfirmedOpenApiWrite } from '../feishu/openApiLedgerWriter.js';
import { prepareInventoryWorkflow, type InventoryWorkflowPreview } from './inventoryActionEngine.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';

export interface BatchOutboundInput {
  date: string;
  outboundDate: string;
  items: Array<{ reference: string; sn: string }>;
}

export interface BatchOutboundPreview {
  operation: 'BATCH_OUTBOUND';
  items: number;
  rows: InventoryWorkflowPreview['rows'];
  warnings: string[];
}

export async function previewBatchOutbound(input: BatchOutboundInput, port: WarehouseReadPort): Promise<BatchOutboundPreview> {
  if (!input.items.length || input.items.length > 100) throw new TypeError('INVALID_BATCH_OUTBOUND_SIZE');
  const seen = new Set<string>();
  const rows: InventoryWorkflowPreview['rows'] = [];
  for (const item of input.items) {
    const sn = item.sn?.trim().toUpperCase().replace(/\s+/g, '');
    const reference = item.reference?.trim();
    if (!sn || !reference || seen.has(sn)) throw new TypeError('DUPLICATE_OR_INCOMPLETE_OUTBOUND_ITEM');
    seen.add(sn);
    const preview = await prepareInventoryWorkflow({ workflow: 'OUTBOUND', date: input.date, outboundDate: input.outboundDate, reference, sn }, port);
    rows.push(...preview.rows);
  }
  return { operation: 'BATCH_OUTBOUND', items: input.items.length, rows, warnings: ['确认前可使用“回撤本次选择”返回，不会写入台账。'] };
}

export async function confirmBatchOutbound(
  input: BatchOutboundInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await previewBatchOutbound(input, port);
  return writer.append(preview.rows);
}
