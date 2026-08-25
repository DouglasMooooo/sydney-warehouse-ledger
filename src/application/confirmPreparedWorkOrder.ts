import type { WarehouseReadPort } from './contracts.js';
import { preparedConditionForWarehouse } from './erpWarehouseRules.js';
import { nextPickupCode } from './workOrderPreview.js';
import type { OpenApiLedgerWriter, ConfirmedOpenApiWrite } from '../feishu/openApiLedgerWriter.js';
import { parseBusinessDateString } from '../ledger/businessDate.js';
import type { LedgerWriteInput } from '../ledger/typedWrite.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';

export interface PreparedConfirmLine {
  sku: string;
  model?: string;
  erpWarehouse: string;
  location: string;
  sns: string[];
  locationConfirmed: boolean;
  sourceFileName?: string;
  sourceRow?: number;
}

export interface PreparedConfirmInput {
  businessDate:string;
  sh:string;
  lines:PreparedConfirmLine[];
}

export interface PreparedBatchConfirmInput {
  businessDate: string;
  workOrders: Array<{ sh: string; sourceFileName?: string; lines: PreparedConfirmLine[] }>;
}

export interface PreparedPrintLabel {
  sh: string;
  pickupCode: string;
  lines: Array<{
    sku: string;
    model: string;
    erpWarehouse: string;
    stockCondition: '新机' | '维修良品';
    qty: number;
    suggestedLocation: string;
    containerCode?: string;
  }>;
}

export interface PreparedBatchConfirmResult extends ConfirmedOpenApiWrite {
  workOrders: Array<{ sh: string; pickupCode: string }>;
  labels: PreparedPrintLabel[];
}

export async function confirmPreparedWorkOrder(
  input:PreparedConfirmInput, port:WarehouseReadPort, writer:Pick<OpenApiLedgerWriter,'append'>,
  env:Readonly<Record<string,string|undefined>>=process.env,
):Promise<ConfirmedOpenApiWrite & {pickupCode:string}> {
  const batch = await confirmPreparedWorkOrderBatch({ businessDate: input.businessDate, workOrders: [{ sh: input.sh, lines: input.lines }] }, port, writer, env);
  return { rows: batch.rows, verified: true, reconciliation: 'PASS', pickupCode: batch.workOrders[0]!.pickupCode };
}

export async function confirmPreparedWorkOrderBatch(
  input: PreparedBatchConfirmInput, port: WarehouseReadPort, writer: Pick<OpenApiLedgerWriter,'append'>,
  env: Readonly<Record<string,string|undefined>> = process.env,
): Promise<PreparedBatchConfirmResult> {
  assertBusinessMutationAllowed(env);
  const date = parseBusinessDateString(input.businessDate);
  if (!date || !input.workOrders.length || input.workOrders.length > 20) throw new TypeError('INVALID_PREPARED_BATCH');
  const existingCodes = await port.readPickupCodes();
  const usedSh = new Set<string>();
  const allSn = new Set<string>();
  const rows: LedgerWriteInput[] = [];
  const labels: PreparedPrintLabel[] = [];
  const workOrders: PreparedBatchConfirmResult['workOrders'] = [];

  for (const workOrder of input.workOrders) {
    const sh = workOrder.sh?.trim();
    if (!sh || usedSh.has(sh) || !workOrder.lines.length) throw new TypeError('INVALID_OR_DUPLICATE_PREPARED_SH');
    usedSh.add(sh);
    const pickupCode = nextPickupCode(existingCodes);
    if (!pickupCode) throw new TypeError('PICKUP_CODE_UNAVAILABLE');
    existingCodes.push(pickupCode);
    const labelGroups = new Map<string, PreparedPrintLabel['lines'][number]>();

    for (const line of workOrder.lines) {
      if (!line.locationConfirmed || !line.location?.trim() || !line.sku?.trim() || !line.erpWarehouse?.trim() || !line.sns.length) {
        throw new TypeError('INCOMPLETE_PREPARED_LINE');
      }
      const condition = preparedConditionForWarehouse(line.erpWarehouse);
      const product = await port.findProduct(line.sku);
      if (!product) throw new TypeError('PRODUCT_MASTER_NOT_FOUND');
      const candidates = await port.findAvailableInventory(line.sku, condition, line.sns.length);
      const source = candidates.find(item=>item.location===line.location&&item.availableQty>=line.sns.length);
      if (!source) throw new TypeError('SOURCE_INVENTORY_NOT_AVAILABLE');
      const provenance = `Replacement source=${line.sourceFileName ?? workOrder.sourceFileName ?? 'uploaded XLSX'}${line.sourceRow ? ` row=${line.sourceRow}` : ''}`;
      for (const rawSn of line.sns) {
        const sn=rawSn.trim().toUpperCase().replace(/\s+/g,'');
        if(!sn||allSn.has(sn)) throw new TypeError('DUPLICATE_OR_EMPTY_SN');
        allSn.add(sn);
        rows.push({date,action:'备货',shNo:sh,pickupCode,sku:line.sku,sn,qty:1,fromLocation:line.location,
          erpWarehouse:line.erpWarehouse,stockCondition:condition,remark:provenance,
          ...(source.container?{containerCode:source.container}:{})});
      }
      const key = `${line.sku}\u0000${product.model}\u0000${line.erpWarehouse}`;
      const current = labelGroups.get(key);
      if (current) current.qty += line.sns.length;
      else labelGroups.set(key, { sku: line.sku, model: product.model, erpWarehouse: line.erpWarehouse,
        stockCondition: condition, qty: line.sns.length, suggestedLocation: line.location,
        ...(source.container ? { containerCode: source.container } : {}) });
    }
    workOrders.push({ sh, pickupCode });
    labels.push({ sh, pickupCode, lines: [...labelGroups.values()] });
  }
  if (rows.length > 100) throw new TypeError('PREPARED_BATCH_TOO_LARGE');
  return { ...await writer.append(rows), workOrders, labels };
}
