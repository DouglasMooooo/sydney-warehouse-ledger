import type { WarehouseReadPort } from './contracts.js';
import { preparedConditionForWarehouse } from './erpWarehouseRules.js';
import { nextPickupCode } from './workOrderPreview.js';
import type { OpenApiLedgerWriter, ConfirmedOpenApiWrite } from '../feishu/openApiLedgerWriter.js';
import { parseBusinessDateString } from '../ledger/businessDate.js';
import type { LedgerWriteInput } from '../ledger/typedWrite.js';
import { assertBusinessMutationAllowed } from '../safety/readOnlyRelease.js';

export interface PreparedConfirmInput {
  businessDate:string;
  sh:string;
  lines:Array<{sku:string;erpWarehouse:string;location:string;sns:string[];locationConfirmed:boolean}>;
}

export async function confirmPreparedWorkOrder(input:PreparedConfirmInput, port:WarehouseReadPort, writer:Pick<OpenApiLedgerWriter,'append'>, env:Readonly<Record<string,string|undefined>>=process.env):Promise<ConfirmedOpenApiWrite & {pickupCode:string}> {
  assertBusinessMutationAllowed(env);
  const date=parseBusinessDateString(input.businessDate);
  if(!date||!input.sh?.trim()||!input.lines.length) throw new TypeError('INVALID_PREPARED_CONFIRMATION');
  const pickupCode=nextPickupCode(await port.readPickupCodes());
  if(!pickupCode) throw new TypeError('PICKUP_CODE_UNAVAILABLE');
  const allSn=new Set<string>();
  const rows:LedgerWriteInput[]=[];
  for(const line of input.lines){
    if(!line.locationConfirmed||!line.location?.trim()||!line.sku?.trim()||!line.erpWarehouse?.trim()||!line.sns.length) throw new TypeError('INCOMPLETE_PREPARED_LINE');
    const condition=preparedConditionForWarehouse(line.erpWarehouse);
    const candidates=await port.findAvailableInventory(line.sku,condition,line.sns.length);
    const source=candidates.find(item=>item.location===line.location&&item.availableQty>=line.sns.length);
    if(!source) throw new TypeError('SOURCE_INVENTORY_NOT_AVAILABLE');
    for(const rawSn of line.sns){
      const sn=rawSn.trim().toUpperCase().replace(/\s+/g,'');
      if(!sn||allSn.has(sn)) throw new TypeError('DUPLICATE_OR_EMPTY_SN');
      allSn.add(sn);
      rows.push({date,action:'备货',shNo:input.sh,pickupCode,sku:line.sku,sn,qty:1,fromLocation:line.location,erpWarehouse:line.erpWarehouse,stockCondition:condition,...(source.container?{containerCode:source.container}:{})});
    }
  }
  return {...await writer.append(rows),pickupCode};
}
