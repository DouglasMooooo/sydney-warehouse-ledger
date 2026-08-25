import type { LocationSummary } from './locationSummary.js';

export function warehouseDesignFixture(): Array<LocationSummary & {displayText:string}> {
  const result:Array<LocationSummary & {displayText:string}>=[];
  for(const rack of [1,2]) for(const row of [1,2,3,4]) for(const bay of [1,2,3,4,5,6]) for(const side of ['L','M','R']) {
    if(rack===2&&bay===6) continue;
    const location=`R${rack}-${row}-${bay}-${side}`;
    const occupied=(rack+row+bay+(side==='R'?1:0))%3===0;
    const mixed=occupied&&(row+bay)%5===0;
    const skuLines=occupied?[{sku:bay%2?'97-141-00060-B0':'97-223-00088-00',qty:(row*bay*7)%99+1},...(mixed?[{sku:'20-205-00018-02',qty:6}]:[])]:[];
    const totalQty=skuLines.reduce((sum,item)=>sum+item.qty,0);
    result.push({location,totalQty,skuLines,containers:[],displayText:location});
  }
  for(const location of ['REPAIR-01','RETURN-01','DISPATCH-01','FLEX-01']) result.push({location,totalQty:location==='RETURN-01'?0:14,skuLines:location==='RETURN-01'?[]:[{sku:'混装服务区',qty:14}],containers:[],displayText:location});
  return result;
}
