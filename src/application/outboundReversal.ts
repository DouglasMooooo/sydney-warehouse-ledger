import type { LedgerWriteInput } from '../ledger/typedWrite.js';
import { prepareLedgerWrite } from '../ledger/typedWrite.js';
import type { ConfirmedOpenApiWrite, OpenApiLedgerWriter, WarehouseLedgerWriteContext } from '../feishu/openApiLedgerWriter.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';
import type { OutboundTransaction, WarehouseReadPort } from './contracts.js';
import { isOperationalShNumber } from './shNumber.js';
import { outboundReversalMarker } from './outboundReversalMarker.js';

export interface OutboundReversalInput {
  date: string;
  shNo: string;
}

export interface OutboundReversalPreview {
  operation: 'OUTBOUND_REVERSAL';
  shNo: string;
  items: OutboundTransaction[];
  rows: LedgerWriteInput[];
  warnings: string[];
}

export async function previewOutboundReversal(
  input: OutboundReversalInput,
  port: WarehouseReadPort,
): Promise<OutboundReversalPreview> {
  const shNo = normalizeSh(input.shNo);
  if (!port.findReversibleOutboundBySh) throw new TypeError('OUTBOUND_REVERSAL_LOOKUP_UNAVAILABLE');
  const items = await port.findReversibleOutboundBySh(shNo);
  if (!items.length) throw new TypeError('OUTBOUND_NOT_FOUND_OR_ALREADY_REVERSED');
  if (items.length > 100) throw new TypeError('OUTBOUND_REVERSAL_LIMIT_EXCEEDED');

  const serialized = items.filter((item): item is OutboundTransaction & { sn: string } => Boolean(item.sn));
  if (serialized.length) {
    const current = port.findCurrentSerializedInventoryBatch
      ? await port.findCurrentSerializedInventoryBatch(serialized.map((item) => item.sn))
      : await Promise.all(serialized.map((item) => port.findCurrentSerializedInventory?.(item.sn)));
    const bySn = new Map(current.filter(Boolean).map((item) => [item!.sn, item!]));
    for (const item of serialized) {
      const state = bySn.get(item.sn);
      if (!state || state.currentState !== 'OUTBOUND' || state.sku !== item.sku) {
        throw new TypeError(`OUTBOUND_REVERSAL_STATE_CONFLICT:${item.sn}`);
      }
    }
  }

  const rows = items.map((item): LedgerWriteInput => ({
    date: input.date,
    action: '库存调增',
    shNo: item.shNo,
    pickupCode: item.pickupCode,
    containerCode: item.containerCode,
    sku: item.sku,
    sn: item.sn,
    qty: item.qty,
    toLocation: item.fromLocation,
    erpWarehouse: item.erpWarehouse,
    stockCondition: item.stockCondition,
    remark: `Outbound reversal · ${item.shNo} · ${outboundReversalMarker(item.ledgerRow)}`,
  }));
  for (const row of rows) {
    const prepared = prepareLedgerWrite(row, true);
    if (!prepared.ok) throw new TypeError(`LEDGER_VALIDATION_FAILED:${prepared.errors.map((item) => item.code).join(',')}`);
  }
  return {
    operation: 'OUTBOUND_REVERSAL', shNo, items, rows,
    warnings: [
      '回撤不会删除原始出库记录；系统会追加受控库存调增流水并保留原始行号，便于审计。',
      '回撤完成后，该 SH 将重新进入待取货队列。',
    ],
  };
}

export async function confirmOutboundReversal(
  input: OutboundReversalInput,
  port: WarehouseReadPort,
  writer: Pick<OpenApiLedgerWriter, 'append'>,
  env: Readonly<Record<string, string | undefined>> = process.env, context?: WarehouseLedgerWriteContext,
): Promise<ConfirmedOpenApiWrite> {
  assertBusinessMutationAllowed(env);
  const preview = await previewOutboundReversal(input, port);
  return writer.append(preview.rows, context);
}

function normalizeSh(value: string): string {
  const shNo = String(value ?? '').trim().toUpperCase();
  if (!isOperationalShNumber(shNo)) throw new TypeError('INVALID_SH_REFERENCE');
  return shNo;
}
