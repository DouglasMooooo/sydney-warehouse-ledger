# Feishu UAT Configuration — Sydney Warehouse

Replace `<uat-host>` with the persistent HTTPS Node.js host. Do not commit real secrets, spreadsheet identifiers, or user identifiers.

## Exact URLs

| Purpose | Value |
| --- | --- |
| Application entry URL | `https://<uat-host>/` |
| OAuth start URL | `https://<uat-host>/api/auth/feishu/start` |
| OAuth callback URL | `https://<uat-host>/api/auth/feishu/callback` |
| Post-login landing | `https://<uat-host>/dashboard` |
| Readiness URL | `https://<uat-host>/api/health` |

Register the callback exactly—no wildcard. The application does not accept a return-to URL, so it cannot redirect to a browser-supplied external target.

## Required server environment

```text
FEISHU_READ_ADAPTER=openapi
FEISHU_APP_ID=<server secret manager value>
FEISHU_APP_SECRET=<server secret manager value>
FEISHU_SPREADSHEET_TOKEN=<server secret manager value>
FEISHU_MAIN_SHEET_ID=<server secret manager value>
FEISHU_CURRENT_INVENTORY_SHEET_ID=<server secret manager value>
FEISHU_OAUTH_REDIRECT_URI=https://<uat-host>/api/auth/feishu/callback
WAREHOUSE_SESSION_SECRET=<random 32+ characters>
WAREHOUSE_ADMIN_USERS=<comma-separated Feishu open_id list>
WAREHOUSE_OPERATOR_USERS=<comma-separated Feishu open_id list>
WAREHOUSE_READ_ONLY_USERS=<comma-separated Feishu open_id list>
READ_ONLY_RELEASE=true
APP_VERSION=<immutable Git commit or release identifier>
WAREHOUSE_DEV_AUTH=false
```

`FEISHU_OAUTH_SCOPES` is optional. The current `/authen/v1/user_info` call requires no API scope for the minimal `open_id`/name response according to the official endpoint documentation; leave optional scopes blank unless the Feishu console explicitly requires consent for the selected H5 login configuration. Do not request email, phone, employee ID, or broad contact scopes.

## Minimum Feishu permissions

The application calls:

- `GET /open-apis/authen/v1/user_info` using the short-lived OAuth user token;
- `GET /open-apis/sheets/v3/spreadsheets/:token/sheets/query` for worksheet metadata;
- `GET /open-apis/sheets/v2/spreadsheets/:token/values/:range` with `UnformattedValue` and, for deep scan, `Formula`.

Configure the minimum read-only set required by the actual calls:

- `sheets:spreadsheet:read` for worksheet metadata/query (confirmed by the current application-identity denial);
- `sheets:spreadsheet:readonly` for the official v2 single-range values endpoint, subject to final console verification.

**No spreadsheet write scope is required or authorized.** Do not add `sheets:spreadsheet`, `sheets:spreadsheet:write_only`, drive write, or other editing scopes. If the Feishu console shows that one read-only scope satisfies both exact endpoints, retain only that narrower effective set and record the evidence.

API scope alone is insufficient. In the target spreadsheet, use the document menu to **add the UAT application as a document app** with read access. The readiness check must prove both metadata and a real range read.

Current evidence: the locally configured CLI application identity was denied before document-access evaluation because `sheets:spreadsheet:read` was not enabled. This is not the designated deployed UAT application and was not modified. Application scope activation and subsequent document-app access therefore remain PENDING.

## UAT role mapping

Use stable, app-specific Feishu `open_id` values only in the host secret configuration. Do not commit them. Precedence remains Admin > Operator > Read Only. Configure at least one READ_ONLY user, one WAREHOUSE_OPERATOR user, and one authenticated but unlisted user for negative testing. An unlisted user must receive no session and see `当前账号未获得仓库系统权限`.

## Security and embedding decision

The current CSP permits framing only by self, `*.feishu.cn`, and `*.larksuite.com` so the same build can be tested in a Feishu H5 webview. It does not grant browser access to Feishu OpenAPI (`connect-src 'self'`). During console UAT, confirm whether Feishu navigates top-level or embeds a frame. If it always navigates top-level, narrow `frame-ancestors` to `'self'`; do not broaden the list to arbitrary origins.

Use a persistent HTTPS Node.js runtime. Edge-only deployment is unsupported. If multiple replicas are introduced, the current in-memory per-user rate limiter is not globally coordinated; keep a single UAT instance or add a controlled shared limiter later.
