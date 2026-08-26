'use client';

import { parseRackLocation } from '../../../src/application/locationVisualisation';

export interface MatrixLocation { location:string; totalQty:number; skuLines:Array<{sku:string;qty:number}>; containers:string[] }

export function WarehouseMatrix({ locations, selectableSku, requiredQty=1, selectedLocation, onSelect, selectionMode='source' }: {
  locations: MatrixLocation[]; selectableSku?: string | undefined; requiredQty?: number; selectedLocation?: string; onSelect?: ((location:string)=>void) | undefined;
  selectionMode?: 'source' | 'target';
}) {
  const entries = locations.map(item=>({item,position:parseRackLocation(item.location)}));
  const rackEntries = entries.filter((entry): entry is typeof entry & {position:NonNullable<typeof entry.position>}=>Boolean(entry.position));
  const services = entries.filter(entry=>!entry.position).map(entry=>entry.item);
  const racks = [...new Set(rackEntries.map(entry=>entry.position.rack))].sort((a,b)=>a-b);
  return <div className={`warehouse-matrix ${selectionMode}-mode${onSelect?' selection-mode':''}`}>
    <div className="matrix-legend"><span><i className="empty"/>空库位</span><span><i className="occupied"/>有库存</span>{onSelect&&<span><i className="eligible"/>{selectionMode==='target'?'可选目标':'可选来源'}</span>}<small>R1-2-3-L = 货架1 · 第2排 · 第3个 Bay · 左侧</small></div>
    {racks.map(rack=>{
      const rackItems=rackEntries.filter(entry=>entry.position.rack===rack);
      const rows=[...new Set(rackItems.map(entry=>entry.position.row))].sort((a,b)=>b-a);
      const bays=[...new Set(rackItems.map(entry=>entry.position.bay))].sort((a,b)=>a-b);
      return <section className="matrix-rack" key={rack}>
        <div className="matrix-rack-title"><strong>R{rack}</strong><span>货架{rack}</span></div>
        <div className="matrix-scroll"><table><thead><tr><th rowSpan={2}>排</th>{bays.map(bay=><th colSpan={3} key={bay}>第{bay}列</th>)}</tr><tr>{bays.flatMap(bay=>(['L','M','R'] as const).map(side=><th key={`${bay}-${side}`}>第{bay}列-{side}</th>))}</tr></thead>
        <tbody>{rows.map(row=><tr key={row}><th>第{row}排</th>{bays.flatMap(bay=>(['L','M','R'] as const).map(side=>{
          const entry=rackItems.find(candidate=>candidate.position.row===row&&candidate.position.bay===bay&&candidate.position.side===side);
          return <MatrixCell key={`${row}-${bay}-${side}`} item={entry?.item} selectableSku={selectableSku} requiredQty={requiredQty} selected={entry?.item.location===selectedLocation} onSelect={onSelect} selectionMode={selectionMode}/>;
        }))}</tr>)}</tbody></table></div>
      </section>;
    })}
    {services.length>0&&<section className="matrix-service"><h3>服务区域</h3><div className="matrix-service-scroll"><table><tbody><tr>{services.map(item=><MatrixCell key={item.location} item={item} selectableSku={selectableSku} requiredQty={requiredQty} selected={item.location===selectedLocation} onSelect={onSelect} selectionMode={selectionMode}/>)}</tr></tbody></table></div></section>}
  </div>;
}

function MatrixCell({item,selectableSku,requiredQty,selected,onSelect,selectionMode}:{item?:MatrixLocation | undefined;selectableSku?:string | undefined;requiredQty:number;selected:boolean;onSelect?: ((location:string)=>void) | undefined;selectionMode:'source'|'target'}) {
  const eligible=Boolean(item&&(selectionMode==='target'||(selectableSku&&item.skuLines.some(line=>line.sku===selectableSku&&line.qty>=requiredQty))));
  const occupied=Boolean(item&&item.totalQty>0);
  const mixed=(item?.skuLines.length??0)>1;
  const content=<><strong>{item?.location??'—'}</strong>{!occupied?<span>空</span>:<>{mixed&&<em>混装 · {item!.skuLines.length}个料号</em>}{item!.skuLines.slice(0,2).map(line=><span key={line.sku}>{line.sku}<b>数量:{line.qty}</b></span>)}</>}</>;
  return <td className={`matrix-cell ${occupied?'occupied':'empty'} ${eligible?'eligible':''} ${selected?'selected':''}`}>
    {onSelect&&eligible?<button type="button" onClick={()=>onSelect(item!.location)} aria-label={`${selectionMode==='target'?'选择目标库位':'选择来源库位'} ${item!.location}`}>{content}</button>:<div>{content}</div>}
  </td>;
}
