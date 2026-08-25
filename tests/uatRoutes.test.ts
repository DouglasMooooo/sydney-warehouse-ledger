import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { assertReadOnlyRelease } from '../src/safety/readOnlyRelease.js';

test('OAuth responses preserve and clear the state cookie, omit incompatible PKCE, and have no open redirect input', () => {
  const start = readFileSync('app/api/auth/feishu/start/route.ts', 'utf8');
  const callback = readFileSync('app/api/auth/feishu/callback/route.ts', 'utf8');
  for (const source of [start, callback]) assert(source.includes("Cache-Control', 'no-store"));
  for (const source of [start, callback]) {
    assert(source.includes("sameSite: secure ? 'none' as const : 'lax' as const"));
    assert(source.includes('httpOnly: true'));
  }
  assert(start.includes('const secure = runtime === \'production\''));
  assert(start.includes("response.cookies.set('warehouse_oauth_state', state, options)"));
  assert(callback.includes("response.cookies.set('warehouse_oauth_state', '', options)"));
  assert(!start.includes('warehouse_oauth_verifier'));
  assert(!callback.includes('warehouse_oauth_verifier'));
  assert(!start.includes('code_challenge'));
  assert(callback.includes("stage: error.stage, providerCode: error.providerCode ?? null"));
  assert(callback.includes("new URL('/dashboard', oauthConfig.redirectUri)"));
  assert(!callback.includes("new URL('/dashboard', request.url)"));
  assert(callback.includes('{ status: 403'));
  assert(callback.includes('当前账号未获得仓库系统权限'));
  for (const unsafe of ['returnTo', 'return_to', 'redirect_uri', "searchParams.get('next')"]) assert(!callback.includes(unsafe));
});

test('login, unauthorized, and logout UX are explicit and privacy-safe', () => {
  assert(readFileSync('app/page.tsx', 'utf8').includes('使用飞书登录'));
  assert(readFileSync('app/unauthorized/page.tsx', 'utf8').includes('当前账号未获得仓库系统权限'));
  const layout = readFileSync('app/(warehouse)/layout.tsx', 'utf8');
  assert(layout.includes('退出'));
  assert(layout.includes('/api/auth/logout'));
  const logout = readFileSync('app/api/auth/logout/route.ts', 'utf8');
  assert(logout.includes('maxAge: 0'));
  assert(logout.includes("Cache-Control', 'no-store"));
});

test('READ_ONLY_UAT registers only explicitly allowed read-only warehouse POST routes', () => {
  assert.doesNotThrow(() => assertReadOnlyRelease({ READ_ONLY_RELEASE: 'true' }));
  assert.throws(() => assertReadOnlyRelease({}), /READ_ONLY_RELEASE=true/);
  const routeFiles = allFiles('app/api/warehouse').filter((path) => path.endsWith('/route.ts'));
  const postRoutes = routeFiles.filter((path) => /export\s+async\s+function\s+POST\s*\(/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(postRoutes.sort(), [
    'app/api/warehouse/ai/query/route.ts',
    'app/api/warehouse/exceptions/deep-scan/route.ts',
    'app/api/warehouse/returns/preview/route.ts',
    'app/api/warehouse/work-orders/preview/route.ts',
  ]);
  for (const forbidden of ['confirm', 'adjustment', 'reservation', 'finalize']) assert(!routeFiles.some((path) => path.toLowerCase().includes(forbidden)));
  assert.equal(existsSync('app/api/warehouse/work-orders/prepare/route.ts'), false);
});

test('production security headers are configured without granting browser OpenAPI access', () => {
  const config = readFileSync('next.config.ts', 'utf8');
  for (const header of ['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy']) assert(config.includes(header));
  assert(config.includes("frame-ancestors 'self' https://*.feishu.cn https://*.larksuite.com"));
  assert(config.includes("connect-src 'self'"));
});

test('Render UAT hosting is a single Node Docker service with server-only configuration', () => {
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const render = readFileSync('render.yaml', 'utf8');
  assert(dockerfile.includes('FROM node:22-bookworm-slim'));
  assert(dockerfile.includes('RUN npm run build'));
  assert(dockerfile.includes('CMD ["npm", "run", "start"'));
  assert(render.includes('runtime: docker'));
  assert(render.includes('healthCheckPath: /api/health'));
  assert(/key: READ_ONLY_RELEASE\r?\n\s+value: "true"/.test(render));
  assert(/key: WAREHOUSE_DEV_AUTH\r?\n\s+value: "false"/.test(render));
  assert(!render.includes('NEXT_PUBLIC_'));
  for (const secret of ['FEISHU_APP_SECRET', 'FEISHU_SPREADSHEET_TOKEN', 'FEISHU_APP_ID']) {
    const block = render.slice(render.indexOf(`key: ${secret}`), render.indexOf(`key: ${secret}`) + 90);
    assert(block.includes('sync: false'), `${secret} must be supplied by the host secret manager`);
  }
});

test('warehouse HTTP routes do not import ledger writers or typed write executors', () => {
  for (const path of allFiles('app/api/warehouse').filter((value) => value.endsWith('/route.ts'))) {
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['src/feishu/write', 'feishu/write', 'typedWrite', 'appendLedger', 'writeExplicitCells']) {
      assert(!source.includes(forbidden), `${path} must not reference ${forbidden}`);
    }
  }
});

test('return intake route accepts SN JSON and does not require an XLSX upload', () => {
  const route = readFileSync('app/api/warehouse/returns/preview/route.ts', 'utf8');
  assert(route.includes('prepareBadMachineReceivePreview'));
  assert(route.includes('warehouseReadAdapterFromEnv'));
  assert(route.includes('request.json()'));
  assert(!route.includes('formData()'));
  assert(!route.includes('ExcelJsWorkbookReader'));
});

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? allFiles(path) : [path];
  });
}
