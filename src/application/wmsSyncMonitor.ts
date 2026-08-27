export type WmsSyncState = 'NOT_CONFIGURED' | 'READY_TO_SYNC';

export interface WmsSyncMonitor {
  state: WmsSyncState;
  writeAttempted: false;
  message: string;
}

/**
 * Reports integration readiness only. Inventory operations remain ledger-first;
 * no WMS write is attempted until a separately reviewed adapter is configured.
 */
export function getWmsSyncMonitor(environment: NodeJS.ProcessEnv = process.env): WmsSyncMonitor {
  if (!environment.WMS_SYNC_ENDPOINT) {
    return {
      state: 'NOT_CONFIGURED',
      writeAttempted: false,
      message: 'WMS 反写连接尚未配置；本系统已记录操作，但没有向 WMS 发起写入。',
    };
  }
  return {
    state: 'READY_TO_SYNC',
    writeAttempted: false,
    message: 'WMS 连接已配置，待接入经审批的反写适配器后才会发送操作。',
  };
}
