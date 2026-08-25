import type { WarehouseReadPort } from './contracts.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';
import type { ConfirmedOpenApiWrite, OpenApiLedgerWriter } from '../feishu/openApiLedgerWriter.js';
import { prepareInventoryWorkflow, type InventoryWorkflowInput, type InventoryWorkflowPreview } from './inventoryActionEngine.js';

export const CONTROLLED_UAT_ACTIONS = ['入库', '出库', '移库', '库存调增', '库存调减'] as const;
export type ControlledOperationInput = InventoryWorkflowInput;

export async function executeControlledLedgerOperation(
  input: ControlledOperationInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await prepareInventoryWorkflow(input, port);
  return writer.append(preview.rows);
}

export function previewControlledLedgerOperation(input: ControlledOperationInput, port: WarehouseReadPort): Promise<InventoryWorkflowPreview> {
  return prepareInventoryWorkflow(input, port);
}
