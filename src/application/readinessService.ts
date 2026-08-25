import { inspectUatRuntimeConfig, UAT_MODE, CONTROLLED_WRITE_UAT_MODE } from '../config/runtimeConfig.js';
import { warehouseSheetReaderFromEnv } from '../feishu/sheetReader.js';
import { assertBusinessMutationAllowed, assertReadOnlyRelease, isControlledWriteUat } from '../safety/readOnlyRelease.js';

export type ServiceReadiness = 'ok' | 'unavailable';

export interface ReadinessSnapshot {
  ok: boolean;
  mode: typeof UAT_MODE | typeof CONTROLLED_WRITE_UAT_MODE;
  version: string;
  services: { authConfig: ServiceReadiness; openApiConfig: ServiceReadiness; ledgerRead: ServiceReadiness };
}

export async function getReadinessSnapshot(
  env: Readonly<Record<string, string | undefined>> = process.env,
  spreadsheetCheck: () => Promise<boolean> = () => warehouseSheetReaderFromEnv(env).healthCheck(),
): Promise<ReadinessSnapshot> {
  const config = inspectUatRuntimeConfig(env);
  let releaseGateReady = true;
  try { if(isControlledWriteUat(env)) assertBusinessMutationAllowed(env); else assertReadOnlyRelease(env); } catch { releaseGateReady = false; }
  let ledgerRead: ServiceReadiness = 'unavailable';
  if (releaseGateReady && config.openApiConfigured) {
    try { ledgerRead = await spreadsheetCheck() ? 'ok' : 'unavailable'; } catch { /* privacy-safe degradation */ }
  }
  const services = {
    authConfig: config.authConfigured && config.rolesConfigured ? 'ok' as const : 'unavailable' as const,
    openApiConfig: config.openApiConfigured && config.versionConfigured && releaseGateReady ? 'ok' as const : 'unavailable' as const,
    ledgerRead,
  };
  return { ok: Object.values(services).every((value) => value === 'ok'), mode: isControlledWriteUat(env)?CONTROLLED_WRITE_UAT_MODE:UAT_MODE, version: env.APP_VERSION?.trim() || 'unconfigured', services };
}
