# Phase 2.8 Live Deployment Gate

## Deployment

| Gate | Status | Evidence |
| --- | --- | --- |
| Real HTTPS Node host | PENDING | Render dashboard requires login; no deployment is claimed. |
| Exact release commit | PENDING DEPLOYMENT | Git head is known, but no deployed version exists. |
| Feishu H5 entry/callback | PENDING | Available CLI has no internal developer-app configuration command; browser console requires login. |
| Limited UAT app publication | PENDING | No dedicated UAT app/version published. |
| Rollback | PREPARED | Host, app version, document access, roles, and secrets rollback steps documented. |

## Configuration

| Gate | Status | Evidence |
| --- | --- | --- |
| Dedicated read-only UAT app | FAIL / BLOCKED | Connected CLI app is broad and includes write-capable spreadsheet scopes; it is explicitly rejected for UAT. |
| Minimum app-identity scopes | FAIL | Real bot metadata request is missing `sheets:spreadsheet:read`; no permission was added. |
| No UAT write scope | PENDING | Requires a separate dedicated application. |
| Spreadsheet app read access | PENDING | Scope failure prevented document-access evaluation. |
| Runtime environment | PENDING | No authenticated host secret store. |
| Role configuration | PENDING | Code now allows empty Admin but requires Operator and Read Only users. |
| Config checker | BLOCKED | Cannot pass before host/dedicated-app configuration. |
| Health ready | PENDING | No deployed host. |

## Auth

OAuth launch/session/logout/no-session/unlisted/READ_ONLY/OPERATOR live tests: **PENDING**. Downstream UAT stopped at configuration failure as required.

## OpenAPI

| Gate | Status | Evidence |
| --- | --- | --- |
| Trusted user workbook read | PASS | Live workbook-structure read succeeded; aggregate sheet count only was retained. |
| Application metadata read | FAIL | Missing application-identity read scope. |
| Application range read | PENDING | Not attempted after metadata failure. |
| Formula/date transport | PENDING | No hosted OpenAPI readiness. |

## Business parity

Dashboard, inventory, Tasks, Pickup, Layout, Exceptions, Product/Location, and Pickup Code parity: **PENDING**. No comparison is claimed without a working hosted OpenAPI identity.

## UI UAT

Dashboard, Tasks, Layout, Exceptions, desktop/mobile Feishu H5, and session interaction: **PENDING**.

## XLSX

Private historical regression and deployed preview: **PENDING**. Existing fixture count remains 0 and Faulty Unit leakage is not measured.

## Security

Live HTTPS headers, bundle/network leak check, rate limiting, safe failure behavior, and no-stale-data behavior: **PENDING**. Static code gates remain in place.

Credential-free local gates: TypeScript **PASS**; 140 tests **PASS**; production build **PASS**. Private fixture runner returned `PRIVATE_FIXTURES_NOT_CONFIGURED` with 0 fixtures.

## Write audit

| Gate | Status |
| --- | --- |
| Allowed warehouse POST routes only | PASS — Preview and Deep Scan only |
| Warehouse routes invoke no writer | PASS |
| Online spreadsheet/business writes performed in Phase 2.8 | **0** |
| Phase 3 enabled | NO |

**PHASE 2.8 LIVE READ-ONLY UAT: BLOCKED — NOT PASS.** The next required action is authenticated creation/configuration of a dedicated read-only Feishu internal application and real HTTPS host.
