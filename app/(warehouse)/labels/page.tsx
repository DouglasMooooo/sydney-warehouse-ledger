import Link from 'next/link';
import { Printer } from '@phosphor-icons/react/dist/ssr';

export default function Page() {
  return <><header className="console-header"><div><h2>标签打印 <small>Pickup Code 批次标签</small></h2><p>标签在备货确认完成后生成；一个 Pickup Code 默认一张 A4 标签。</p></div></header><section className="label-entry"><Printer size={38}/><h3>从已确认的备货批次生成</h3><p>标签包含 SH、Pickup Code、SKU、Model、ERP 仓库、库存属性、建议库位/容器和数量。可批量勾选后打印。</p><Link className="execute-button" href="/work-orders">进入工单备货与标签打印</Link></section></>;
}
