import { inspectUatRuntimeConfig, UAT_MODE } from '../config/runtimeConfig.js';
import { warehouseSheetReaderFromEnv } from '../feishu/sheetReader.js';
import { assertReadOnlyRelease } from '../safety/readOnlyRelease.js';
import { isGoogleSheetsUatMode } from '../demo/visualDemo.js';

export type ServiceReadiness = 'ok' | 'unavailable';

export interface ReadinessSnapshot {
  ok: boolean;
  mode: typeof UAT_MODE;
  version: string;
  services: { authConfig: ServiceReadiness; openApiConfig: ServiceReadiness; ledgerRead: ServiceReadiness };
}

export async function getReadinessSnapshot(
  env: Readonly<Record<string, string | undefined>> = process.env,
  spreadsheetCheck: () => Promise<boolean> = () => warehouseSheetReaderFromEnv(env).healthCheck(),
): Promise<ReadinessSnapshot> {
  const config = inspectUatRuntimeConfig(env);
  const googleSheetsUat = isGoogleSheetsUatMode(env);
  let readOnlyReady = true;
  try { assertReadOnlyRelease(env); } catch { readOnlyReady = false; }
  let ledgerRead: ServiceReadiness = 'unavailable';
  if (readOnlyReady && (config.openApiConfigured || googleSheetsUat)) {
    try { ledgerRead = await spreadsheetCheck() ? 'ok' : 'unavailable'; } catch { /* privacy-safe degradation */ }
  }
  const services = {
    authConfig: googleSheetsUat || (config.authConfigured && config.rolesConfigured) ? 'ok' as const : 'unavailable' as const,
    openApiConfig: (googleSheetsUat || (config.openApiConfigured && config.versionConfigured)) && readOnlyReady ? 'ok' as const : 'unavailable' as const,
    ledgerRead,
  };
  return { ok: Object.values(services).every((value) => value === 'ok'), mode: UAT_MODE, version: env.APP_VERSION?.trim() || 'unconfigured', services };
}
