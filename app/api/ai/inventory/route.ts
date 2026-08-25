import { LiveInventoryQueryService } from '../../../../src/application/queries/inventoryQueryService';
import { warehouseReadAdapterFromEnv } from '../../../../src/feishu/warehouseReadAdapter';
import { operationalLedgerProvenance } from '../../../../src/ai/provenance';
import { withAiQueryRoute } from '../../../../src/ai/queryRoute';
export const runtime='nodejs'; export const dynamic='force-dynamic';

export const GET=withAiQueryRoute({capability:'warehouse.inventory.read',queryType:'INVENTORY',async handler({request}){
  const params=new URL(request.url).searchParams;
  const query={...(params.get('sku')?{sku:params.get('sku')!}:{}),...(params.get('displayName')?{displayName:params.get('displayName')!}:{}),
    ...(params.get('location')?{location:params.get('location')!}:{}),...(params.get('stockCondition')?{stockCondition:params.get('stockCondition')!}:{})};
  const data=await new LiveInventoryQueryService(warehouseReadAdapterFromEnv()).search(query);
  const now=new Date();
  return {data,provenance:operationalLedgerProvenance(now.toISOString(),now),dataSources:['OPERATIONAL_LEDGER']};
}});
