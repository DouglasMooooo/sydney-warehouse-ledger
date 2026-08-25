import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { todayInSydney } from '../../../src/ledger/businessDate';
import { ReturnPreviewClient } from './return-preview-client';
export const dynamic='force-dynamic';
export default async function ReturnsPage(){let auth;try{auth=await authenticateWarehousePage('RETURN_PREVIEW');}catch{return <div className="notice error">当前账号未获得退回返修预览权限</div>;}return <><header className="console-header"><div><h2>坏机接收 <small>SN → 料号规则解析</small></h2><p>批量粘贴 SN，系统按可审计编码规则识别；未知 revision 必须人工确认。</p></div><div className="readonly-lock">UAT 环境 · 所有写入已锁定</div></header><ReturnPreviewClient initialBusinessDate={todayInSydney()} operatorName={auth.user.displayName ?? auth.user.userId}/></>;}
