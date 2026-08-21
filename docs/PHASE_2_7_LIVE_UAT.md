# Phase 2.7 — Real Feishu Configuration and Live Read-Only UAT

## Outcome at code handoff

The repository now contains the safe tooling and single-instance Node hosting definition required to begin real Feishu read-only UAT. The designated UAT credentials, HTTPS host, console permissions, document access, and role identities were not available in this environment. Configuration and live UAT are therefore **PENDING**, not passed.

Running `npm run uat:feishu-config-check` in the current environment safely stops at `UAT_RUNTIME_CONFIG_INVALID`; no network request or business write occurs before runtime validation passes. The checker prints only step status and a controlled diagnostic code.

Production business writes remain exactly **0**. The only warehouse POST routes are XLSX Work Order Preview and explicit Deep Scan. Auth/logout routes are outside the warehouse business-mutation boundary.

## Prepared code and infrastructure

- Runtime validation requires the OpenAPI adapter, exact HTTPS OAuth callback, server-only credentials/ledger identifiers, signed-session secret, role lists, immutable app version, `WAREHOUSE_DEV_AUTH=false`, and `READ_ONLY_RELEASE=true`.
- Incomplete production configuration logs a safe readiness marker instead of crash-looping. `/api/health` remains degraded and protected warehouse screens fail closed.
- `npm run uat:feishu-config-check` validates credentials, tenant token, metadata scope, document access, and one tiny unformatted range read without outputting secrets, identifiers, cell content, or upstream bodies.
- Private diagnostic failures distinguish token, scope, document access, missing spreadsheet, and range-read failures. Public APIs retain sanitized errors.
- `Dockerfile` and `render.yaml` prepare one Node 22 Render service with HTTPS supplied by the host, server-only environment values, and `/api/health` readiness.
- The production Next.js build passed. A local Docker image build was not executed because Docker is not installed in the implementation environment; the Docker/Render definition is covered by static regression tests and still requires Render deployment evidence.
- Normal GitHub CI remains credential-free. Live evidence must be collected separately and must never place secrets or user/business identifiers in public CI.

## Exact external sequence

1. Create the Render Blueprint from `render.yaml` and populate all server-only values documented in `FEISHU_UAT_CONFIGURATION.md`.
2. Set the callback to `https://<uat-host>/api/auth/feishu/callback`; register it exactly and set the H5 entry to `https://<uat-host>/`.
3. Enable only the minimum effective read-only spreadsheet scopes. Start with the two endpoint-specific candidates documented in the configuration guide, remove any permission proven redundant, and grant no write scope.
4. Publish the UAT app version and add that application as a document app/read collaborator on the target spreadsheet.
5. Run `npm run uat:feishu-config-check`. Do not continue until every step passes.
6. Verify `/api/health` reports safe `READ_ONLY_UAT` readiness for the deployed release commit.
7. Execute the live matrix below and record only aggregate/privacy-safe evidence.

## Live UAT matrix

All rows remain PENDING until tested against the real deployment.

| Area | Required evidence |
| --- | --- |
| OAuth/session | App launch → state/PKCE → callback → verified identity → role mapping → signed session; refresh, logout, tamper, and expiry behavior. |
| Roles | READ_ONLY, WAREHOUSE_OPERATOR, authenticated-unlisted, and no-session results match the approved 200/403/401/redirect matrix. |
| OpenAPI/parity | Same workbook state; exact aggregate equality for Dashboard, inventory/conditions, Tasks, Pickup, Layout, Exceptions, Product/Location sources, and Pickup Code scan. |
| Dates | Inspect real `A Date` and `B Outbound_Date`, including a historical text-date case if present. Keep text dates distinguishable; `DATE_STORED_AS_TEXT` remains PARTIAL without proof. |
| Formulas | Validate Formula rendering and value alignment for H, I, O, Q, R, S, T, W, X, Y, Z, AA, AB, AC. Upgrade no rule beyond evidence. |
| Validation metadata | Keep `VALIDATION_NOT_OK` UNAVAILABLE unless actual OpenAPI validation metadata is accessible and implemented. |
| UI | Dashboard, Today Tasks, Layout/location reconciliation, live Exceptions versus Deep Scan, and truthful FULL/PARTIAL/UNAVAILABLE labels. |
| XLSX | Private real historical files display expected Replacement-only values; Pickup Code remains “仅为预览，未预留”; no reservation/write occurs. |
| Private regression | Populate 20+ gitignored fixtures if available; report only aggregate EXACT_PASS / EXPECTED_NEEDS_CONFIRMATION / UNEXPECTED_FAIL and Faulty Unit leakage. |
| Operations/security | Preview/deep-scan rate limiting, required HTTPS headers in Feishu H5, bundle/network secret scan, health response, safe failure cases, and no stale-data fallback. |

Any integer parity mismatch, incorrect Replacement interpretation, secret exposure, unavailable-rule overclaim, or reachable business mutation stops the phase. Do not change live ledger data to force parity.

## Stop boundary

Phase 3 is not authorized. No Prepared/Outbound/Return/Move/Adjustment/Pickup reservation/Label confirmation route may be introduced until the complete configuration and live UAT gates are reviewed and approved.
