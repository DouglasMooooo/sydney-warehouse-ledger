# Feishu Internal H5 Read-Only Deployment Checklist

## Feishu console

- [ ] Create/select the Sydney Warehouse internal app and choose an H5/web application entry.
- [ ] Configure the exact HTTPS web domain and launch URL.
- [ ] Register the exact OAuth callback URL used by `FEISHU_OAUTH_REDIRECT_URI`; do not use wildcards.
- [ ] Enable user identity/login capability and approve the minimum user identity scopes required by the OAuth user-info endpoint.
- [ ] Grant the minimum spreadsheet read scope (for example `sheets:spreadsheet:readonly`) required by the official range-read API.
- [ ] Add the internal app/tenant identity to the warehouse spreadsheet with read access. API scope alone does not grant document access.
- [ ] Publish the app version to the intended UAT users only.

## Host and environment

- [ ] Use a supported production Node runtime with HTTPS; do not deploy the OpenAPI reader to an Edge runtime.
- [ ] Set `FEISHU_READ_ADAPTER=openapi`.
- [ ] Set server-only `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_SPREADSHEET_TOKEN`, `FEISHU_MAIN_SHEET_ID`, and `FEISHU_CURRENT_INVENTORY_SHEET_ID`.
- [ ] Set server-only `WAREHOUSE_SESSION_SECRET` to a random value of at least 32 characters and store it in the host secret manager.
- [ ] Set `WAREHOUSE_ADMIN_USERS`, `WAREHOUSE_OPERATOR_USERS`, and `WAREHOUSE_READ_ONLY_USERS` using stable Feishu `open_id` values. Confirm precedence and remove departed users.
- [ ] Set `READ_ONLY_RELEASE=true`, `WAREHOUSE_DEV_AUTH=false`, `NODE_ENV=production`, and an immutable `APP_VERSION`.
- [ ] Do not create any credential named `NEXT_PUBLIC_*`.
- [ ] Ensure logs and error monitoring apply the repository's privacy boundary.

## Web security

- [ ] Keep cookies HttpOnly, Secure, SameSite=Lax, Path=/, with the production `__Host-` name.
- [ ] Configure CSP for the actual application assets and Feishu embedding behavior; allow only documented Feishu frame ancestors if embedding is required.
- [ ] Configure `frame-ancestors`, `connect-src`, and redirect allowlists narrowly after testing the selected webview mode.
- [ ] Confirm the OAuth callback cannot be framed or cached and state/PKCE cookies survive the Feishu launch flow.
- [ ] If more than one application instance is used, replace the in-memory rate limiter with a shared store.

## Read-only UAT

- [ ] Verify no session is 401 and an unlisted authenticated user is 403.
- [ ] Verify READ_ONLY can use Dashboard/Tasks/Layout/Exceptions but cannot use Work Order Preview.
- [ ] Verify WAREHOUSE_OPERATOR can run preview and receives no raw token, sheet ID, formula, or workbook dump.
- [ ] Verify Dashboard, Today Tasks, Warehouse Layout, live Exceptions, explicit Deep Scan, and XLSX Preview against the authorized ledger.
- [ ] Confirm `只读试运行` is visible and Return/Move/Adjustment/Label controls are absent.
- [ ] Confirm `/api/health` reports ledger/auth `ok`, mode `read-only`, and `readOnlyRelease: true` without identifiers.
- [ ] Run `npm run test:work-orders-private`; collect at least 20 historical fixtures if available and keep all files/results private.
- [ ] Confirm request logs contain only approved fields.
- [ ] Confirm production business writes remain 0.

## Release and rollback

- [ ] Run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` from the exact release commit.
- [ ] Record the Git commit and successful CI run in the release gate.
- [ ] Retain an immediate rollback deployment and a way to remove the app version from UAT users.
- [ ] Do not add a confirm/write route under Phase 2.5. Phase 3 needs a separate review and approval.
