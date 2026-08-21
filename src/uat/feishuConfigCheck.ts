import { validateUatRuntimeConfig } from '../config/runtimeConfig.js';

export type FeishuUatFailureCode =
  | 'UAT_RUNTIME_CONFIG_INVALID'
  | 'FEISHU_TOKEN_FAILED'
  | 'FEISHU_SCOPE_MISSING'
  | 'FEISHU_DOCUMENT_ACCESS_DENIED'
  | 'FEISHU_SPREADSHEET_NOT_FOUND'
  | 'FEISHU_RANGE_READ_FAILED';

export interface FeishuConfigCheckStep {
  name: 'runtimeConfig' | 'authCredentials' | 'tenantToken' | 'spreadsheetMetadata' | 'spreadsheetDocumentAccess' | 'rangeRead';
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  failureCode?: FeishuUatFailureCode;
}

export interface FeishuConfigCheckResult {
  ok: boolean;
  mode: 'READ_ONLY_UAT';
  steps: FeishuConfigCheckStep[];
}

interface ApiEnvelope { code?: number; msg?: string; message?: string; tenant_access_token?: string; expire?: number; data?: unknown }

export async function runFeishuConfigCheck(
  env: Readonly<Record<string, string | undefined>> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<FeishuConfigCheckResult> {
  const steps: FeishuConfigCheckStep[] = [];
  try { validateUatRuntimeConfig(env); }
  catch { return failedAt(steps, 'runtimeConfig', 'UAT_RUNTIME_CONFIG_INVALID'); }
  steps.push(pass('runtimeConfig'), pass('authCredentials'));

  let token: string;
  try {
    const response = await fetchImpl('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: env.FEISHU_APP_ID, app_secret: env.FEISHU_APP_SECRET }),
    });
    const body = await json(response);
    if (!response.ok || body.code !== 0 || typeof body.tenant_access_token !== 'string') return failedAt(steps, 'tenantToken', 'FEISHU_TOKEN_FAILED');
    token = body.tenant_access_token;
    steps.push(pass('tenantToken'));
  } catch { return failedAt(steps, 'tenantToken', 'FEISHU_TOKEN_FAILED'); }

  const metadata = await safeGet(
    fetchImpl,
    `/open-apis/sheets/v3/spreadsheets/${encodeURIComponent(env.FEISHU_SPREADSHEET_TOKEN!)}/sheets/query`,
    token,
  );
  if (!metadata.ok) return failedAt(steps, 'spreadsheetMetadata', classify(metadata, 'FEISHU_RANGE_READ_FAILED'));
  steps.push(pass('spreadsheetMetadata'));

  const range = await safeGet(
    fetchImpl,
    `/open-apis/sheets/v2/spreadsheets/${encodeURIComponent(env.FEISHU_SPREADSHEET_TOKEN!)}/values/${encodeURIComponent(`${env.FEISHU_MAIN_SHEET_ID}!A1:A1`)}`,
    token,
    { valueRenderOption: 'UnformattedValue' },
  );
  if (!range.ok) {
    const code = classify(range, 'FEISHU_RANGE_READ_FAILED');
    if (code === 'FEISHU_DOCUMENT_ACCESS_DENIED') return failedAt(steps, 'spreadsheetDocumentAccess', code);
    return failedAt(steps, 'rangeRead', code);
  }
  steps.push(pass('spreadsheetDocumentAccess'), pass('rangeRead'));
  return { ok: true, mode: 'READ_ONLY_UAT', steps };
}

interface SafeApiResult { ok: boolean; status: number; code?: number; message: string }

async function safeGet(fetchImpl: typeof fetch, path: string, token: string, params: Record<string, string> = {}): Promise<SafeApiResult> {
  try {
    const url = new URL(path, 'https://open.feishu.cn');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } });
    const body = await json(response);
    const result: SafeApiResult = { ok: response.ok && body.code === 0, status: response.status, message: String(body.msg ?? body.message ?? '') };
    if (typeof body.code === 'number') result.code = body.code;
    return result;
  } catch { return { ok: false, status: 0, message: '' }; }
}

function classify(result: SafeApiResult, fallback: FeishuUatFailureCode): FeishuUatFailureCode {
  const message = result.message.toLowerCase();
  if (result.code === 99991672 || /scope|permission_violations/.test(message)) return 'FEISHU_SCOPE_MISSING';
  if (result.status === 404 || /not found|not exist|spreadsheet.*invalid/.test(message)) return 'FEISHU_SPREADSHEET_NOT_FOUND';
  if (result.code === 1310213 || result.status === 403 || /permission fail|access denied|forbidden|no permission/.test(message)) return 'FEISHU_DOCUMENT_ACCESS_DENIED';
  return fallback;
}

function failedAt(steps: FeishuConfigCheckStep[], name: FeishuConfigCheckStep['name'], failureCode: FeishuUatFailureCode): FeishuConfigCheckResult {
  const order: FeishuConfigCheckStep['name'][] = ['runtimeConfig', 'authCredentials', 'tenantToken', 'spreadsheetMetadata', 'spreadsheetDocumentAccess', 'rangeRead'];
  steps.push({ name, status: 'FAIL', failureCode });
  const seen = new Set(steps.map((step) => step.name));
  for (const remaining of order) if (!seen.has(remaining)) steps.push({ name: remaining, status: 'SKIPPED' });
  return { ok: false, mode: 'READ_ONLY_UAT', steps };
}

function pass(name: FeishuConfigCheckStep['name']): FeishuConfigCheckStep { return { name, status: 'PASS' }; }
async function json(response: Response): Promise<ApiEnvelope> { try { return await response.json() as ApiEnvelope; } catch { return {}; } }
