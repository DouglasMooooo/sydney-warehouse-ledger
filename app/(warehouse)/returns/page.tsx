import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { todayInSydney } from '../../../src/ledger/businessDate';
import { ReturnPreviewClient } from './return-preview-client';
export const dynamic='force-dynamic';
export default async function ReturnsPage(){try{await authenticateWarehousePage('RETURN_PREVIEW');}catch{return <div className="notice error">当前账号未获得退回返修预览权限</div>;}return <><header className="console-header"><div><h2>批量退回返修 <small>只需输入 SN</small></h2><p>无需上传工单；每个 SN 自动生成一条待修记录，默认进入 REPAIR-01。</p></div><div className="readonly-lock">UAT 环境 · 所有写入已锁定</div></header><ReturnPreviewClient initialBusinessDate={todayInSydney()}/></>;}
