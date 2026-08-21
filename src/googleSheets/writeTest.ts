import { createSign, randomUUID } from 'node:crypto';

export const GOOGLE_UAT_WRITE_TEST_SHEET = 'UAT_写入测试' as const;

export interface GoogleWriteTestResult {
  requestId: string;
  timestamp: string;
  updatedRange: string;
}

export interface GoogleWriteTestConfig {
  spreadsheetId: string;
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
}

export function googleWriteTestConfigFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): GoogleWriteTestConfig {
  if (env.WAREHOUSE_GOOGLE_WRITE_TEST !== 'true') {
    throw new GoogleWriteTestUnavailableError('Google UAT write test is disabled.');
  }
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID?.trim();
  const serviceAccountEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  if (!spreadsheetId || !serviceAccountEmail || !privateKey) {
    throw new GoogleWriteTestUnavailableError('Google UAT write credentials are incomplete.');
  }
  return { spreadsheetId, serviceAccountEmail, serviceAccountPrivateKey: privateKey };
}

export class GoogleWriteTestUnavailableError extends Error {
  readonly code = 'WRITE_TEST_UNAVAILABLE';
}

export class GoogleWriteTestFailedError extends Error {
  readonly code = 'WRITE_TEST_FAILED';
}

export class GoogleSheetsWriteTestClient {
  constructor(
    private readonly config: GoogleWriteTestConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
    private readonly requestId: () => string = randomUUID,
  ) {}

  async appendSmokeTest(remark = ''): Promise<GoogleWriteTestResult> {
    const timestamp = this.now().toISOString();
    const requestId = this.requestId();
    const accessToken = await this.accessToken();
    const range = `'${GOOGLE_UAT_WRITE_TEST_SHEET}'!A:E`;
    const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.config.spreadsheetId)}/values/${encodeURIComponent(range)}:append`);
    url.searchParams.set('valueInputOption', 'RAW');
    url.searchParams.set('insertDataOption', 'INSERT_ROWS');
    url.searchParams.set('includeValuesInResponse', 'true');
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: [[timestamp, requestId, 'API_ENDPOINT', 'PASS', boundedRemark(remark)]] }),
      cache: 'no-store',
    });
    if (!response.ok) throw new GoogleWriteTestFailedError(`Google Sheets append returned HTTP ${response.status}`);
    const payload = await response.json() as { updates?: { updatedRange?: string; updatedRows?: number } };
    if (payload.updates?.updatedRows !== 1 || !payload.updates.updatedRange?.includes(GOOGLE_UAT_WRITE_TEST_SHEET)) {
      throw new GoogleWriteTestFailedError('Google Sheets did not confirm one test row in the expected tab.');
    }
    return { requestId, timestamp, updatedRange: payload.updates.updatedRange };
  }

  private async accessToken(): Promise<string> {
    const issuedAt = Math.floor(this.now().getTime() / 1000);
    const assertion = signJwt({
      iss: this.config.serviceAccountEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600,
    }, this.config.serviceAccountPrivateKey);
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      cache: 'no-store',
    });
    if (!response.ok) throw new GoogleWriteTestFailedError(`Google OAuth returned HTTP ${response.status}`);
    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) throw new GoogleWriteTestFailedError('Google OAuth response did not include an access token.');
    return payload.access_token;
  }
}

function signJwt(payload: Record<string, string | number>, privateKey: string): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function boundedRemark(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
}
