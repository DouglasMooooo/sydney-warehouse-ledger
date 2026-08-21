# Feishu Internal H5 Read-Only Deployment Checklist

Project-specific values and paths are in `FEISHU_UAT_CONFIGURATION.md`; that document is authoritative for Phase 2.7.

## Feishu console

- [ ] Create/select the Sydney Warehouse internal app and choose an H5/web application entry.
- [ ] Configure the exact HTTPS web domain and launch URL.
- [ ] Register the exact OAuth callback URL used by `FEISHU_OAUTH_REDIRECT_URI`; do not use wildcards.
- [ ] Enable user identity/login capability and approve the minimum user identity scopes required by the OAuth user-info endpoint.
- [ ] Grant the minimum read-only set for the exact calls: `sheets:spreadsheet:read` (metadata/query) and `sheets:spreadsheet:readonly` (v2 range read), then remove any scope proven redundant. Grant no spreadsheet write scope.
- [ ] Add the internal app/tenant identity to the warehouse spreadsheet with read access. API scope alone does not grant document access.
- [ ] Publish the app version to the intended UAT users only.

## Host and environment

- [ ] Create the Render Blueprint from `render.yaml` on branch `phase1-safe-implementation`; use the included Node 22 Docker runtime, stable HTTPS URL, and one UAT instance.
- [ ] Set `FEISHU_READ_ADAPTER=openapi`.
- [ ] Set server-only `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_SPREADSHEET_TOKEN`, `FEISHU_MAIN_SHEET_ID`, and `FEISHU_CURRENT_INVENTORY_SHEET_ID`.
- [ ] Set server-only `WAREHOUSE_SESSION_SECRET` to a random value of at least 32 characters and store it in the host secret manager.
- [ ] Set `WAREHOUSE_ADMIN_USERS`, `WAREHOUSE_OPERATOR_USERS`, and `WAREHOUSE_READ_ONLY_USERS` using stable Feishu `open_id` values. Confirm precedence and remove departed users.
- [ ] Set `READ_ONLY_RELEASE=true`, `WAREHOUSE_DEV_AUTH=false`, `NODE_ENV=production`, and an immutable `APP_VERSION`.
- [ ] Do not create any credential named `NEXT_PUBLIC_*`.
- [ ] Ensure logs and error monitoring apply the repository's privacy boundary.
- [ ] Run `npm run uat:feishu-config-check` from a trusted host shell. Resolve scope and document-access failures separately; never paste secrets or full API bodies into an issue/report.
- [ ] Confirm an incomplete configuration produces degraded `/api/health` readiness and cannot expose warehouse screens; it should not require a crash loop.

## Web security

- [ ] Keep cookies HttpOnly, Secure, SameSite=Lax, Path=/, with the production `__Host-` name.
- [ ] Configure CSP for the actual application assets and Feishu embedding behavior; allow only documented Feishu frame ancestors if embedding is required.
- [ ] Configure `frame-ancestors`, `connect-src`, and redirect allowlists narrowly after testing the selected webview mode.
- [ ] Confirm the OAuth callback cannot be framed or cached and state/PKCE cookies survive the Feishu launch flow.
- [ ] If more than one application instance is used, replace the in-memory rate limiter with a shared store.

## Read-only UAT

- [ ] Record a safe five-step configuration-check result: credentials, tenant token, metadata scope, document access, and tiny range read.
- [ ] Verify no session is 401 and an unlisted authenticated user is 403.
- [ ] Verify READ_ONLY can use Dashboard/Tasks/Layout/Exceptions but cannot use Work Order Preview.
- [ ] Verify WAREHOUSE_OPERATOR can run preview and receives no raw token, sheet ID, formula, or workbook dump.
- [ ] Verify Dashboard, Today Tasks, Warehouse Layout, live Exceptions, explicit Deep Scan, and XLSX Preview against the authorized ledger.
- [ ] Confirm `只读试运行` is visible and Return/Move/Adjustment/Label controls are absent.
- [ ] Confirm `/api/health` reports mode `READ_ONLY_UAT` and separate `authConfig`, `openApiConfig`, and `ledgerRead` statuses without identifiers.
- [ ] Run `npm run test:work-orders-private`; collect at least 20 historical fixtures if available and keep all files/results private.
- [ ] Confirm request logs contain only approved fields.
- [ ] Confirm production business writes remain 0.

## Release and rollback

- [ ] Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` from the exact release commit.
- [ ] Record the Git commit and successful CI run in the release gate.
- [ ] Retain an immediate rollback deployment and a way to remove the app version from UAT users.
- [ ] Do not add a confirm/write route under Phase 2.7. Phase 3 needs a separate review and approval.
