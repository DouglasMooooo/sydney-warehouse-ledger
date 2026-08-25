'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowsLeftRight, ClockCounterClockwise, Package, Printer, Scan, Toolbox, Warehouse } from '@phosphor-icons/react';
const items = [['/dashboard','工作台',Toolbox],['/work-orders','工单备货',Scan],['/returns','坏机接收',ClockCounterClockwise],['/moves','库存作业',ArrowsLeftRight],['/labels','标签',Printer],['/warehouse-layout','仓库图',Warehouse],['/tasks','作业任务',Package]] as const;
export function WarehouseNav(){const pathname=usePathname();return <nav className="top-nav" aria-label="Warehouse navigation">{items.map(([href,label,Icon])=><Link className={pathname===href?'active':''} key={href} href={href}><Icon size={17} weight="bold"/>{label}</Link>)}</nav>;}
