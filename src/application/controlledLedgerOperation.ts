import type { WarehouseReadPort } from './contracts.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';
import type { ConfirmedOpenApiWrite, OpenApiLedgerWriter, WarehouseLedgerWriteContext } from '../feishu/openApiLedgerWriter.js';
import { prepareInventoryWorkflow, type InventoryWorkflowInput, type InventoryWorkflowPreview } from './inventoryActionEngine.js';
import { newCommandId } from './commandId.js';

export const CONTROLLED_UAT_ACTIONS = ['入库', '出库', '移库', '库存调增', '库存调减'] as const;
export type ControlledOperationInput = InventoryWorkflowInput;

export interface ControlledBatchTransferInput {
  commandId?: string;
  workflow: 'MOVE' | 'REPAIR_COMPLETE';
  date: string;
  toLocation: string;
  sns: string[];
}

export interface ControlledBatchInboundLine {
  sn: string;
  sku: string;
  toLocation: string;
  stockCondition: '新机' | '维修良品' | '待修' | '报废' | '物料';
  containerCode?: string;
  remark?: string;
}

export interface ControlledBatchInboundInput {
  commandId?: string;
  date: string;
  lines: ControlledBatchInboundLine[];
}

export interface ControlledBatchInboundPreview {
  commandId: string;
  operation: 'BATCH_INBOUND';
  lines: Array<{ line: ControlledBatchInboundLine; status: 'READY' | 'BLOCKED'; preview?: InventoryWorkflowPreview; reason?: string }>;
  totalRows: number;
  readyCount: number;
  blockedCount: number;
  warnings: string[];
}

export interface ControlledBatchTransferPreview {
  commandId: string;
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
    commandId: input.commandId?.trim() || newCommandId(),
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
  const writeContext: WarehouseLedgerWriteContext = { ...(context ?? { createdBy: 'UNKNOWN_OPERATOR' }), ...(input.commandId ? { commandId: input.commandId } : {}) };
  return writer.append(preview.items.flatMap((item) => item.preview.rows), writeContext);
}

export async function previewControlledBatchInbound(input: ControlledBatchInboundInput, port: WarehouseReadPort): Promise<ControlledBatchInboundPreview> {
  if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 100) throw new TypeError('BATCH_INBOUND_SIZE_REQUIRED');
  const seen = new Set<string>();
  const lines: ControlledBatchInboundPreview['lines'] = [];
  for (const line of input.lines) {
    const sn = String(line.sn ?? '').trim().toUpperCase().replace(/\s+/g, '');
    if (!sn || seen.has(sn)) { lines.push({ line, status: 'BLOCKED', reason: !sn ? 'MISSING_SN' : 'DUPLICATE_IN_BATCH' }); continue; }
    seen.add(sn);
    try {
      if (port.findCurrentSerializedInventory) {
        const current = await port.findCurrentSerializedInventory(sn);
        if (current && current.currentState !== 'OUTBOUND') throw new TypeError('SN_ALREADY_IN_CURRENT_INVENTORY');
      }
      const preview = await prepareInventoryWorkflow({ workflow: 'INBOUND', date: input.date, ...line, sn }, port);
      lines.push({ line: { ...line, sn }, status: 'READY', preview });
    } catch (error) { lines.push({ line: { ...line, sn }, status: 'BLOCKED', reason: error instanceof Error ? error.message : 'INBOUND_VALIDATION_FAILED' }); }
  }
  const ready = lines.filter((item) => item.status === 'READY');
  return { commandId: input.commandId?.trim() || newCommandId(), operation: 'BATCH_INBOUND', lines,
    totalRows: ready.reduce((sum, item) => sum + (item.preview?.rows.length ?? 0), 0), readyCount: ready.length,
    blockedCount: lines.length - ready.length, warnings: lines.some((item) => item.status === 'BLOCKED') ? ['存在 BLOCKED 行：本批次默认全有或全无，删除或修正后重新生成预览。'] : [] };
}

export async function executeControlledBatchInbound(
  input: ControlledBatchInboundInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
  context?: WarehouseLedgerWriteContext,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await previewControlledBatchInbound(input, port);
  if (preview.blockedCount) throw new TypeError('BATCH_INBOUND_BLOCKED_LINES');
  return writer.append(preview.lines.flatMap((item) => item.preview?.rows ?? []), { ...(context ?? { createdBy: 'UNKNOWN_OPERATOR' }), ...(input.commandId ? { commandId: input.commandId } : {}) });
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
