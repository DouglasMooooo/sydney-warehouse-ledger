import { inspectUatRuntimeConfig, UAT_MODE, CONTROLLED_WRITE_UAT_MODE } from '../config/runtimeConfig.js';
import { warehouseSheetReaderFromEnv } from '../feishu/sheetReader.js';
import { assertBusinessMutationAllowed, assertReadOnlyRelease, isControlledWriteUat } from '../safety/readOnlyRelease.js';
import { assertMainLedgerSchema } from '../config/ledgerSchema.js';

export type ServiceReadiness = 'ok' | 'unavailable';

export interface ReadinessSnapshot {
  ok: boolean;
  mode: typeof UAT_MODE | typeof CONTROLLED_WRITE_UAT_MODE;
  version: string;
  services: { authConfig: ServiceReadiness; openApiConfig: ServiceReadiness; ledgerRead: ServiceReadiness; ledgerSchema: ServiceReadiness; operationalWrite: ServiceReadiness };
}

export async function getReadinessSnapshot(
  env: Readonly<Record<string, string | undefined>> = process.env,
  spreadsheetCheck: () => Promise<boolean> = () => warehouseSheetReaderFromEnv(env).healthCheck(),
  schemaCheck: () => Promise<boolean> = async () => {
    const reader = warehouseSheetReaderFromEnv(env);
    const sheetId = env.FEISHU_MAIN_SHEET_ID?.trim();
    if (!sheetId) return false;
    const table = await reader.readTable({ sheetId, range: 'A1:AC1' });
    assertMainLedgerSchema(table.columns);
    return true;
  },
): Promise<ReadinessSnapshot> {
  const config = inspectUatRuntimeConfig(env);
  let releaseGateReady = true;
  try { if(isControlledWriteUat(env)) assertBusinessMutationAllowed(env); else assertReadOnlyRelease(env); } catch { releaseGateReady = false; }
  let ledgerRead: ServiceReadiness = 'unavailable';
  let ledgerSchema: ServiceReadiness = 'unavailable';
  if (releaseGateReady && config.openApiConfigured) {
    try { ledgerRead = await spreadsheetCheck() ? 'ok' : 'unavailable'; } catch { /* privacy-safe degradation */ }
    if (ledgerRead === 'ok') {
      try { ledgerSchema = await schemaCheck() ? 'ok' : 'unavailable'; } catch { /* privacy-safe degradation */ }
    }
  }
  const services = {
    authConfig: config.authConfigured && config.rolesConfigured ? 'ok' as const : 'unavailable' as const,
    openApiConfig: config.openApiConfigured && config.versionConfigured && releaseGateReady ? 'ok' as const : 'unavailable' as const,
    ledgerRead,
    ledgerSchema,
    operationalWrite: isControlledWriteUat(env) && ledgerRead === 'ok' && ledgerSchema === 'ok' ? 'ok' as const : 'unavailable' as const,
  };
  const requiresOperationalWrite = isControlledWriteUat(env);
  const readinessServices = requiresOperationalWrite ? Object.values(services) : Object.entries(services)
    .filter(([name]) => name !== 'operationalWrite').map(([, value]) => value);
  return { ok: readinessServices.every((value) => value === 'ok'), mode: requiresOperationalWrite?CONTROLLED_WRITE_UAT_MODE:UAT_MODE, version: env.APP_VERSION?.trim() || 'unconfigured', services };
}
