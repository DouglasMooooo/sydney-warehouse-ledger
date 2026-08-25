import { AiQueryError } from '../../ai/errors.js';
import type { InventoryQuery } from './inventoryQueryService.js';

export function parseLegacyInventoryIntent(question:unknown):InventoryQuery{
  if(typeof question!=='string'||!question.trim()||question.length>500)throw new AiQueryError('UNSUPPORTED_QUERY','Invalid or missing legacy query.');
  const value=question.trim();
  if(/(?:movement|移动记录|流水|生命周期|lifecycle|\bSN\b|异常处理|resolve|调整|写入|执行)/i.test(value))
    throw new AiQueryError('DEPENDENCY_PENDING','This legacy intent depends on an unavailable model or a prohibited write capability.');
  if(!/(?:库存|存量|库位|stock|inventory|available|新机|维修良品|待修|报废|物料)/i.test(value))
    throw new AiQueryError('UNSUPPORTED_QUERY','Ambiguous legacy query.');
  const result:InventoryQuery={};
  const condition=['新机','维修良品','待修','报废','物料'].find((item)=>value.includes(item));
  if(condition)result.stockCondition=condition;
  const sku=/\b(?:\d{2}-[A-Z0-9-]{5,}|[A-Z]{2,}[A-Z0-9-]{3,})\b/i.exec(value)?.[0];
  if(sku)result.sku=sku;
  const location=/\b(?:R\d+-\d+-\d+-[LMR]|REPAIR-\d+|RETURN-\d+|DISPATCH-\d+)\b/i.exec(value)?.[0];
  if(location)result.location=location;
  return result;
}
