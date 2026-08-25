'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClockCounterClockwise, Package, Scan, Toolbox, Warehouse } from '@phosphor-icons/react';
const items = [['/dashboard','工作台',Toolbox],['/work-orders','更换件提取',Scan],['/returns','批量退回返修',ClockCounterClockwise],['/warehouse-layout','库存查询',Warehouse],['/tasks','作业任务',Package]] as const;
export function WarehouseNav(){const pathname=usePathname();return <nav className="top-nav" aria-label="Warehouse navigation">{items.map(([href,label,Icon])=><Link className={pathname===href?'active':''} key={href} href={href}><Icon size={17} weight="bold"/>{label}</Link>)}</nav>;}
