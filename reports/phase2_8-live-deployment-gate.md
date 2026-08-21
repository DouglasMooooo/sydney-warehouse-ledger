# Phase 2.8 Live Deployment Gate

Evidence captured on 2026-08-21 (Australia/Sydney). Secrets, application IDs, document tokens, sheet IDs, and user IDs are intentionally omitted.

## Deployment

| Gate | Status | Evidence |
| --- | --- | --- |
| Real HTTPS Node host | PASS | Render Free web service is live at `https://sydney-warehouse-ledger-uat.onrender.com`. Free-tier cold starts remain expected. |
| Exact release commit | PASS | Render deployed commit `7110ec5585152e89c691fc43820b9b20953c84e5` from `phase1-safe-implementation`. |
| Feishu H5 entry/callback | PASS / CONFIGURED | Desktop/mobile entry uses the Render HTTPS root; OAuth callback uses `/api/auth/feishu/callback`. |
| Limited UAT app publication | BLOCKED / ADMIN REVIEW | Version `1.0.0` was submitted with only the Operator and Read Only testers in its availability range. Feishu reports `审核中`. |
| Rollback | PREPARED | Disable the app version, revoke document access, rotate secrets, or suspend the Render service. No ledger rollback is required. |

## Configuration

| Gate | Status | Evidence |
| --- | --- | --- |
| Dedicated read-only UAT app | PASS | A separate `Sydney Warehouse UAT` internal web application was created; the broad CLI integration app was not reused. |
| Minimum app-identity scopes | PASS / PENDING EFFECT | Only spreadsheet read and spreadsheet readonly scopes were enabled. They take effect after version approval/publication. |
| No UAT write scope | PASS | No spreadsheet write scope was enabled; external bot sharing remains disabled. |
| Spreadsheet app read access | BLOCKED BY PUBLICATION | App-ID `view` collaborator creation returned Feishu `1063001 Invalid parameter` while the application version was not online. No permission was added. Retry after approval. |
| Runtime environment | PASS | Render holds server-only app, OAuth, sheet, role, release, and session configuration. The App Secret was rotated and the tenant-token exchange returned code 0. |
| Role configuration | PASS / CONFIGURED | Admin is explicitly empty; one Operator and one Read Only tester are configured with distinct identities. |
| Config checker | BLOCKED | Hosted auth/OpenAPI configuration is valid, but ledger read remains unavailable until publication and document access complete. |
| Health ready | SAFE DEGRADED | `/api/health` returns HTTP 503 with `READ_ONLY_UAT`, auth config `ok`, OpenAPI config `ok`, and ledger read `unavailable`. No stale data is reported. |

## Auth

OAuth launch/session/logout/no-session/unlisted/READ_ONLY/OPERATOR live tests: **PENDING**. Publication and document access are prerequisites.

## OpenAPI

| Gate | Status | Evidence |
| --- | --- | --- |
| Trusted user workbook read | PASS | Live workbook-structure read succeeded; aggregate sheet count only was retained. |
| Dedicated app tenant token | PASS | Token exchange returned HTTP 200/code 0 after secret rotation. No token was logged or committed. |
| Application metadata read | BLOCKED BY PUBLICATION/ACCESS | Sheet query returned Feishu code `1310213`; scopes are not effective and document access is not granted while review is pending. |
| Application range read | PENDING | Not attempted after metadata failure. |
| Formula/date transport | PENDING | Requires hosted OpenAPI readiness. |

## Business parity

Dashboard, inventory, Tasks, Pickup, Layout, Exceptions, Product/Location, and Pickup Code parity: **PENDING**. No comparison is claimed before application publication and a successful hosted ledger read.

## UI UAT

Dashboard, Tasks, Layout, Exceptions, desktop/mobile Feishu H5, and session interaction: **PENDING**.

## XLSX

Private historical regression and deployed preview: **PENDING**. Existing fixture count remains 0 and Faulty Unit leakage is not measured.

## Security

- Dedicated application and server-side secret storage: **PASS**.
- Write-capable spreadsheet scope absent: **PASS**.
- App availability limited to two intended testers: **PASS / PENDING APPROVAL**.
- External bot/group interaction disabled: **PASS**.
- HTTPS headers, bundle/network leak check, rate limiting, and live safe-failure verification: **PENDING**.

Credential-free gates before deployment: TypeScript **PASS**; 140 tests **PASS**; production build **PASS**; GitHub Actions run `32438088594` **PASS** for commit `7110ec5`. Private fixture runner returned `PRIVATE_FIXTURES_NOT_CONFIGURED` with 0 fixtures.

## Write audit

| Gate | Status |
| --- | --- |
| Allowed warehouse POST routes only | PASS — Preview and Deep Scan only |
| Warehouse routes invoke no writer | PASS |
| Online spreadsheet/business writes performed in Phase 2.8 | **0** |
| Permission writes | One failed `view` collaborator request; no permission was created |
| Phase 3 enabled | NO |

**PHASE 2.8 LIVE READ-ONLY UAT: BLOCKED — NOT PASS.** The concrete blocker is Feishu enterprise-admin approval of version `1.0.0`. After approval, retry app-ID `view` access, require a successful metadata/range read, then continue the live UAT matrix.
