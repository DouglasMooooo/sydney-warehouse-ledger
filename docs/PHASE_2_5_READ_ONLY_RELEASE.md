# Phase 2.5 — Authenticated Read-Only Release

## Release boundary

This release is a Feishu internal application using an H5/webview entry. The existing Feishu spreadsheet remains the sole system of record. `READ_ONLY_RELEASE=true` is mandatory. There is no production HTTP route for Prepared, Outbound, Return, Move, Adjustment, Pickup reservation, or label finalisation.

Available navigation and APIs are limited to Dashboard, 今日任务, 仓库布局, 异常, and 工单预览. The UI displays `只读试运行`. Work-order upload performs parse/validation/preview only and reports `zeroWritesPerformed`.

## Truthful exception coverage

The normal page load executes only `LIVE_OPERATIONAL` rules. It does not claim workbook metadata checks. The explicit, rate-limited deep scan reuses the existing quality scanner and covers:

- `DATE_STORED_AS_TEXT`
- `HIDDEN_CHARACTER`
- `FORMULA_MISSING`
- `FORMULA_BROKEN`
- `VALIDATION_NOT_OK`

The deep result contains status, completion time, scanned-row count, issue count, rule coverage, and operational-safe issue DTOs. It does not return formulas, sheet IDs, credentials, or workbook dumps. Before the button is used, the UI truthfully shows that no deep scan has run.

## Identity, roles, and session

Feishu OAuth authorization uses state and S256 PKCE. The server exchanges the one-time code, obtains current-user identity from Feishu, and discards the user token after reading the minimum identity fields. The browser never supplies a trusted user ID or role.

Roles are mapped from server-only comma-separated `open_id` lists. Precedence is `WAREHOUSE_ADMIN > WAREHOUSE_OPERATOR > READ_ONLY`; an unknown authenticated user receives no access. Sessions are HMAC-SHA256 signed, valid for 30 minutes, HttpOnly, SameSite=Lax, and Secure with a `__Host-` cookie in production. A secret of at least 32 characters is required. Missing session returns 401, insufficient permission returns 403, and `DEV_ONLY` is prohibited in production.

Future mutation routes must additionally require an Origin allowlist and a session-bound, short-lived signed confirmation intent/CSRF token submitted in a custom header. The intent must bind user, action, normalized payload hash, ledger preconditions, expiry, and one-time idempotency key. These controls are documented only; no mutation route exists in this release.

## Production ledger-read adapter

Hosted production uses official Feishu OpenAPI through a dedicated server client. It queries worksheets and reads spreadsheet ranges with `UnformattedValue`; the deep scanner additionally reads formula rendering where required. Tenant tokens are held only in process memory, refreshed five minutes before expiry, never logged, and never returned. Local/admin scripts may retain the `lark-cli` reader.

Required workbook resources are supported: main ledger, current inventory, product master, location master, numeric/date-compatible cell values, and formula reads. The value API does not provide a complete workbook-style dump; the implementation intentionally asks only for required ranges. `VALIDATION_NOT_OK` evaluates the controlled validation-result values already present in the ledger rather than requesting validation-rule metadata that would require broader permissions.

The production adapter is implemented but not claimed as deployed. Feishu console setup, document access, scopes, HTTPS hosting, and production credentials still require an operator to complete the deployment checklist.

## Resource and privacy controls

XLSX uploads are `.xlsx` only, ZIP-signature checked, limited to 5 MiB, decoded in memory, and not persisted. Preview is limited per authenticated user. Deep scan has a stricter per-user limit. The current limiter is process-local and suitable for a single-instance UAT host; multi-instance hosting must add a shared limiter without changing domain services.

Operational logs contain only request ID, route, success/failure, duration, error code, and role. They exclude user IDs, workbook content, XLSX content, SN/customer data, sheet IDs, tokens, and secrets. `/api/health` returns only version, release mode, safe service status, and the read-only flag.

## Private historical XLSX gate

Put private fixtures and `manifest.json` under `tests/fixtures/work-orders/private/`; the whole path is gitignored. Run `npm run test:work-orders-private`. Output uses fixture ordinals and totals only. Production work-order values are not committed or printed.

No private fixture directory was available during this implementation, so the gate is `NOT_CONFIGURED` with total 0. Phase 3 requires a target of at least 20 real historical work orders if available. Parser rules must not be weakened to obtain a pass. In particular, Faulty Unit is never a fallback. Until real fixtures demonstrate a safe template variation, a blank row continues to terminate Replacement parsing.

## Release decision

The code-level read-only preparation gate passes after typecheck, unit tests, production build, and CI. Actual staff UAT remains blocked until the console/deployment checklist is completed and private fixture evidence is collected. Production business writes performed by this phase: **0**.
