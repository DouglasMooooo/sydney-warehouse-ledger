import type { WarehouseReadPort } from './contracts.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';
import type { ConfirmedOpenApiWrite, OpenApiLedgerWriter, WarehouseLedgerWriteContext } from '../feishu/openApiLedgerWriter.js';
import { prepareInventoryWorkflow, type InventoryWorkflowInput, type InventoryWorkflowPreview } from './inventoryActionEngine.js';

export const CONTROLLED_UAT_ACTIONS = ['入库', '出库', '移库', '库存调增', '库存调减'] as const;
export type ControlledOperationInput = InventoryWorkflowInput;

export interface ControlledBatchTransferInput {
  workflow: 'MOVE' | 'REPAIR_COMPLETE';
  date: string;
  toLocation: string;
  sns: string[];
}

export interface ControlledBatchTransferPreview {
  workflow: ControlledBatchTransferInput['workflow'];
  label: string;
  toLocation: string;
  items: Array<{ sn: string; preview: InventoryWorkflowPreview }>;
  totalRows: number;
  warnings: string[];
}

export async function executeControlledLedgerOperation(
  input: ControlledOperationInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
  context?: WarehouseLedgerWriteContext,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await prepareInventoryWorkflow(input, port);
  return writer.append(preview.rows, context);
}

export function previewControlledLedgerOperation(input: ControlledOperationInput, port: WarehouseReadPort): Promise<InventoryWorkflowPreview> {
  return prepareInventoryWorkflow(input, port);
}

export async function previewControlledBatchTransfer(
  input: ControlledBatchTransferInput,
  port: WarehouseReadPort,
): Promise<ControlledBatchTransferPreview> {
  if (input.workflow !== 'MOVE' && input.workflow !== 'REPAIR_COMPLETE') throw new TypeError('BATCH_TRANSFER_WORKFLOW_REQUIRED');
  const sns = normalizeBatchSns(input.sns, input.workflow);
  let effectivePort = port;
  if (port.findCurrentSerializedInventoryBatch) {
    const current = await port.findCurrentSerializedInventoryBatch(sns);
    const bySn = new Map(current.map((item) => [item.sn.trim().toUpperCase().replace(/\s+/g, ''), item]));
    effectivePort = Object.create(port) as WarehouseReadPort;
    effectivePort.findCurrentSerializedInventory = async (sn) => bySn.get(sn.trim().toUpperCase().replace(/\s+/g, ''));
  }
  const items = await Promise.all(sns.map(async (sn) => ({
    sn,
    preview: await prepareInventoryWorkflow({ workflow: input.workflow, date: input.date, sn, toLocation: input.toLocation }, effectivePort),
  })));
  return {
    workflow: input.workflow,
    label: input.workflow === 'MOVE' ? '批量移库' : '批量维修完成',
    toLocation: input.toLocation.trim(),
    items,
    totalRows: items.reduce((sum, item) => sum + item.preview.rows.length, 0),
    warnings: items.flatMap((item) => item.preview.warnings.map((warning) => `${item.sn} · ${warning}`)),
  };
}

export async function executeControlledBatchTransfer(
  input: ControlledBatchTransferInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
  context?: WarehouseLedgerWriteContext,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await previewControlledBatchTransfer(input, port);
  return writer.append(preview.items.flatMap((item) => item.preview.rows), context);
}

function normalizeBatchSns(values: string[], workflow: ControlledBatchTransferInput['workflow']): string[] {
  if (!Array.isArray(values)) throw new TypeError('BATCH_SN_LIST_REQUIRED');
  const normalized = values.map((value) => String(value).trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean);
  if (!normalized.length) throw new TypeError('BATCH_SN_LIST_REQUIRED');
  const limit = workflow === 'REPAIR_COMPLETE' ? 50 : 100;
  if (normalized.length > limit) throw new TypeError('BATCH_SN_LIMIT_EXCEEDED');
  if (new Set(normalized).size !== normalized.length) throw new TypeError('DUPLICATE_IN_BATCH');
  return normalized;
}
