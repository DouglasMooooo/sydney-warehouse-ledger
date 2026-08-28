/**
 * Server-log-only OpenAPI probe for a temporarily enabled UAT diagnostic mode.
 * It deliberately performs no mutation and never returns its output to clients.
 */
export interface FeishuDiagnosticEntry {
  STEP: string;
  HTTP_STATUS: number;
  FEISHU_CODE: number | null;
  FEISHU_MSG: string;
  REQUEST_ID: string;
  ENDPOINT_NAME: string;
  TOKEN_TYPE: 'tenant_access_token';
  APP_ID_SUFFIX: string;
  SPREADSHEET_TOKEN_SUFFIX: string;
  RESULT: 'PASS' | 'FAIL' | 'SKIPPED';
  DETAIL?: string;
}

interface Envelope { code?: unknown; msg?: unknown; message?: unknown; request_id?: unknown; tenant_access_token?: unknown; data?: { sheets?: unknown[] } }

export async function runFeishuOpenApiReadDiagnostic(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FeishuDiagnosticEntry[]> {
  const appId = env.FEISHU_APP_ID?.trim() ?? '';
  const suffix = appId ? appId.slice(-6) : 'MISSING';
  const token = env.FEISHU_SPREADSHEET_TOKEN?.trim();
  const mainSheetId = env.FEISHU_MAIN_SHEET_ID?.trim();
  const baselineSheetId = env.FEISHU_CURRENT_INVENTORY_SHEET_ID?.trim();
  const tokenSuffix = token ? token.slice(-6) : 'MISSING';
  const base = (STEP: string, ENDPOINT_NAME: string): Omit<FeishuDiagnosticEntry, 'HTTP_STATUS' | 'FEISHU_CODE' | 'FEISHU_MSG' | 'REQUEST_ID' | 'RESULT'> => ({ STEP, ENDPOINT_NAME, TOKEN_TYPE: 'tenant_access_token', APP_ID_SUFFIX: suffix, SPREADSHEET_TOKEN_SUFFIX: tokenSuffix });
  const output: FeishuDiagnosticEntry[] = [];

  const tokenProbe = await tokenRequest(env, fetchImpl, base('TENANT_TOKEN', 'auth/v3/tenant_access_token/internal'));
  output.push(tokenProbe.entry);
  if (!tokenProbe.token) return output;
  if (!token || !mainSheetId || !baselineSheetId || env.FEISHU_READ_ADAPTER !== 'openapi') {
    output.push({ ...base('RUNTIME_CONFIG', 'runtime-config'), HTTP_STATUS: 0, FEISHU_CODE: null, FEISHU_MSG: 'INVALID_RUNTIME_CONFIG', REQUEST_ID: '', RESULT: 'FAIL', DETAIL: runtimeDetail(env, token, mainSheetId, baselineSheetId) });
    return output;
  }

  const listed = await getProbe(fetchImpl, tokenProbe.token, `/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(token)}/sheets/query`, {}, base('SHEET_LIST', 'sheets/v3/sheets/query'));
  output.push(listed.entry);
  if (!listed.ok) return output;
  const sheetMap = sheetIdsByTitle(listed.body);
  output.push(configCompare(base, 'MAIN_SHEET_ID', '主表 库存流水', mainSheetId, sheetMap));
  output.push(configCompare(base, 'BASELINE_SHEET_ID', '当前库存明细查询', baselineSheetId, sheetMap));
  const locationId = sheetMap.get('库位维护');
  const productId = sheetMap.get('产品库存维护');
  output.push(configCompare(base, 'LOCATION_MASTER_SHEET_ID', '库位维护', locationId, sheetMap));
  output.push(configCompare(base, 'PRODUCT_MASTER_SHEET_ID', '产品库存维护', productId, sheetMap));

  output.push((await getProbe(fetchImpl, tokenProbe.token, valuesPath(token, mainSheetId, 'A1:AC1'), { valueRenderOption: 'UnformattedValue' }, base('MAIN_LEDGER_READ', 'sheets/v2/values/main/A1:AC1'))).entry);
  output.push((await getProbe(fetchImpl, tokenProbe.token, valuesPath(token, baselineSheetId, 'A1:A2'), { valueRenderOption: 'UnformattedValue' }, base('BASELINE_READ', 'sheets/v2/values/baseline/A1:A2'))).entry);
  if (locationId) output.push((await getProbe(fetchImpl, tokenProbe.token, valuesPath(token, locationId, 'A1:A2'), { valueRenderOption: 'UnformattedValue' }, base('LOCATION_MASTER_READ', 'sheets/v2/values/location/A1:A2'))).entry);
  if (productId) output.push((await getProbe(fetchImpl, tokenProbe.token, valuesPath(token, productId, 'A1:A2'), { valueRenderOption: 'UnformattedValue' }, base('PRODUCT_MASTER_READ', 'sheets/v2/values/product/A1:A2'))).entry);
  return output;
}

export function logFeishuOpenApiReadDiagnostic(entries: readonly FeishuDiagnosticEntry[], log: (line: string) => void = console.error): void {
  for (const entry of entries) log(JSON.stringify({ diagnostic: 'FEISHU_OPENAPI_READ', ...entry }));
}

async function tokenRequest(env: Readonly<Record<string, string | undefined>>, fetchImpl: typeof fetch, base: Omit<FeishuDiagnosticEntry, 'HTTP_STATUS' | 'FEISHU_CODE' | 'FEISHU_MSG' | 'REQUEST_ID' | 'RESULT'>): Promise<{ token?: string; entry: FeishuDiagnosticEntry }> {
  try {
    const response = await fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }) });
    const body = await parse(response);
    const token = typeof body.tenant_access_token === 'string' ? body.tenant_access_token : undefined;
    const entry = entryFrom(base, response, body, Boolean(response.ok && body.code === 0 && token));
    return entry.RESULT === 'PASS' && token ? { entry, token } : { entry };
  } catch { return { entry: { ...base, HTTP_STATUS: 0, FEISHU_CODE: null, FEISHU_MSG: 'NETWORK_OR_INVALID_RESPONSE', REQUEST_ID: '', RESULT: 'FAIL' } }; }
}

async function getProbe(fetchImpl: typeof fetch, token: string, path: string, params: Record<string, string>, base: Omit<FeishuDiagnosticEntry, 'HTTP_STATUS' | 'FEISHU_CODE' | 'FEISHU_MSG' | 'REQUEST_ID' | 'RESULT'>): Promise<{ ok: boolean; body: Envelope; entry: FeishuDiagnosticEntry }> {
  try {
    const url = new URL(path, 'https://open.feishu.cn'); for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } }); const body = await parse(response); const entry = entryFrom(base, response, body, response.ok && body.code === 0);
    return { ok: entry.RESULT === 'PASS', body, entry };
  } catch { return { ok: false, body: {}, entry: { ...base, HTTP_STATUS: 0, FEISHU_CODE: null, FEISHU_MSG: 'NETWORK_OR_INVALID_RESPONSE', REQUEST_ID: '', RESULT: 'FAIL' } }; }
}

function valuesPath(token: string, sheetId: string, range: string): string { return `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(token)}/values/${encodeURIComponent(`${sheetId}!${range}`)}`; }
async function parse(response: Response): Promise<Envelope> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as Envelope : {};
  } catch { return {}; }
}
function sheetIdsByTitle(body: Envelope): Map<string, string> { const map = new Map<string, string>(); for (const item of body.data?.sheets ?? []) if (item && typeof item === 'object') { const value = item as Record<string, unknown>; if (typeof value.title === 'string' && typeof value.sheet_id === 'string') map.set(value.title, value.sheet_id); } return map; }
function configCompare(base: (STEP: string, ENDPOINT_NAME: string) => Omit<FeishuDiagnosticEntry, 'HTTP_STATUS' | 'FEISHU_CODE' | 'FEISHU_MSG' | 'REQUEST_ID' | 'RESULT'>, step: string, title: string, configured: string | undefined, sheets: Map<string, string>): FeishuDiagnosticEntry { const actual = sheets.get(title); const match = Boolean(configured && actual && configured === actual); return { ...base(step, 'sheets/v3/sheets/query'), HTTP_STATUS: 200, FEISHU_CODE: 0, FEISHU_MSG: match ? 'MATCH' : 'CONFIG_SHEET_ID_MISMATCH', REQUEST_ID: '', RESULT: match ? 'PASS' : 'FAIL' }; }
function entryFrom(base: Omit<FeishuDiagnosticEntry, 'HTTP_STATUS' | 'FEISHU_CODE' | 'FEISHU_MSG' | 'REQUEST_ID' | 'RESULT'>, response: Response, body: Envelope, pass: boolean): FeishuDiagnosticEntry { return { ...base, HTTP_STATUS: response.status, FEISHU_CODE: typeof body.code === 'number' ? body.code : null, FEISHU_MSG: clean(body.msg ?? body.message), REQUEST_ID: requestId(response, body), RESULT: pass ? 'PASS' : 'FAIL' }; }
function requestId(response: Response, body: Envelope): string { const header = response.headers.get('x-tt-logid') ?? response.headers.get('x-request-id'); return header ?? (typeof body.request_id === 'string' ? body.request_id : ''); }
function clean(value: unknown): string { return String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 240); }
function runtimeDetail(env: Readonly<Record<string, string | undefined>>, token: string | undefined, main: string | undefined, baseline: string | undefined): string { return `READ_ADAPTER=${env.FEISHU_READ_ADAPTER === 'openapi' ? 'MATCH' : 'INVALID'};SPREADSHEET_TOKEN=${token ? 'PRESENT' : 'MISSING'};MAIN_SHEET_ID=${main ? 'PRESENT' : 'MISSING'};BASELINE_SHEET_ID=${baseline ? 'PRESENT' : 'MISSING'}`; }
