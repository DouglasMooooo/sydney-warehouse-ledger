import type { WarehouseReadPort } from './contracts.js';
import { isLedgerAction, type LedgerAction } from '../config/controlledValues.js';
import type { LedgerWriteInput } from '../ledger/typedWrite.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';
import type { ConfirmedOpenApiWrite, OpenApiLedgerWriter } from '../feishu/openApiLedgerWriter.js';

export const CONTROLLED_UAT_ACTIONS = ['入库', '出库', '移库', '库存调增', '库存调减'] as const;
type ControlledUatAction = (typeof CONTROLLED_UAT_ACTIONS)[number];

export interface ControlledOperationInput extends LedgerWriteInput { action: ControlledUatAction }

export async function executeControlledLedgerOperation(
  input: ControlledOperationInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  if (!isLedgerAction(input.action) || !(CONTROLLED_UAT_ACTIONS as readonly LedgerAction[]).includes(input.action)) {
    throw new TypeError('UNSUPPORTED_CONTROLLED_ACTION');
  }
  const trusted: LedgerWriteInput = { ...input };
  if (input.action === '移库' || input.action === '库存调减' || input.action === '出库') {
    if (typeof input.sku !== 'string' || typeof input.stockCondition !== 'string' || typeof input.qty !== 'number') {
      throw new TypeError('SOURCE_INVENTORY_FIELDS_REQUIRED');
    }
    const qty = input.qty;
    const candidates = await port.findAvailableInventory(input.sku, input.stockCondition as never, qty);
    const candidate = candidates.find((item) => item.location === input.fromLocation && item.availableQty >= qty);
    if (!candidate) throw new TypeError('SOURCE_INVENTORY_NOT_AVAILABLE');
    if (input.action === '移库') trusted.sourceStockCondition = candidate.condition;
  }
  const prepared = prepareLedgerWrite(trusted, false);
  if (!prepared.ok) throw new TypeError(`LEDGER_VALIDATION_FAILED:${prepared.errors.map((item) => item.code).join(',')}`);
  return writer.append([trusted]);
}
