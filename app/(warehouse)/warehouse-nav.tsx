'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowsLeftRight, ClipboardText, MagnifyingGlass, ShieldWarning, Toolbox } from '@phosphor-icons/react';
const items = [['/dashboard','今日工作',Toolbox],['/audit','库存查询',MagnifyingGlass],['/moves','业务操作',ArrowsLeftRight],['/audit','操作记录',ClipboardText],['/exceptions','异常',ShieldWarning]] as const;
export function WarehouseNav(){const pathname=usePathname();return <nav className="top-nav" aria-label="Warehouse navigation">{items.map(([href,label,Icon])=><Link className={pathname===href?'active':''} key={href} href={href}><Icon size={17} weight="bold"/>{label}</Link>)}</nav>;}
