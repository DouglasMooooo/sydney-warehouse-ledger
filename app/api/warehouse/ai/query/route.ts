import { LiveInventoryQueryService } from '../../../../../src/application/queries/inventoryQueryService';
import { parseLegacyInventoryIntent } from '../../../../../src/application/queries/legacyAiQueryService';
import { warehouseReadAdapterFromEnv } from '../../../../../src/feishu/warehouseReadAdapter';
import { operationalLedgerProvenance } from '../../../../../src/ai/provenance';
import { withAiQueryRoute } from '../../../../../src/ai/queryRoute';
export const runtime='nodejs';export const dynamic='force-dynamic';

const legacyQueryHandler=withAiQueryRoute({capability:'warehouse.inventory.read',queryType:'LEGACY_NL_QUERY',async handler({request}){
  const body=await request.json() as {question?:unknown};
  const query=parseLegacyInventoryIntent(body.question);
  const data=await new LiveInventoryQueryService(warehouseReadAdapterFromEnv()).search(query);
  const now=new Date();
  return {data:{intent:'INVENTORY' as const,result:data},provenance:operationalLedgerProvenance(now.toISOString(),now),dataSources:['OPERATIONAL_LEDGER']};
}});
export async function POST(request:Request){return legacyQueryHandler(request);}
