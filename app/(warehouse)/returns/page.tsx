import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { todayInSydney } from '../../../src/ledger/businessDate';
import { ReturnPreviewClient } from './return-preview-client';
export const dynamic='force-dynamic';
export default async function ReturnsPage(){try{await authenticateWarehousePage('RETURN_PREVIEW');}catch{return <div className="notice error">当前账号未获得退回返修预览权限</div>;}return <><header className="console-header"><div><h2>批量退回返修 <small>仅 Faulty Unit</small></h2><p>从 RMA 工单提取旧机 SN，统一预览进入 REPAIR-01。</p></div><div className="readonly-lock">UAT 环境 · 所有写入已锁定</div></header><ReturnPreviewClient initialBusinessDate={todayInSydney()}/></>;}
