# Phase 2.7 Live Read-Only UAT Release Gate

## Code gate

| Gate | Status | Evidence |
| --- | --- | --- |
| Real configuration checker | PASS | Controlled command validates runtime, tenant token, metadata, document access, and one tiny unformatted range read. |
| Diagnostic classification | PASS | Token, scope, document access, not-found spreadsheet, and range-read failures are distinct; output excludes secrets/identifiers/bodies. |
| HTTPS Node host preparation | PASS | Render single-instance Node 22 Docker definition and safe health path are committed; this is preparation, not deployment evidence. |
| Degraded startup/readiness | PASS | Invalid production configuration cannot expose warehouse screens; readiness is degraded without an unnecessary crash loop. |
| Read-only route and writer-import audit | PASS | Only Preview and Deep Scan warehouse POSTs exist; warehouse routes do not import writer/typed-write executors. |
| Parity/privacy tooling | PASS | Aggregate-only parity tooling remains available and no real parity is claimed without execution. |
| Deep-scan truthfulness | PASS | FULL/PARTIAL/UNAVAILABLE boundary remains unchanged. |
| Typecheck | PASS | `npm run typecheck`. |
| Unit/regression tests | PASS | `npm test`: 139 tests passed. |
| Production build | PASS | `npm run build`; production route manifest contains no business mutation route. |
| CI | PENDING PUSH | Credential-free GitHub Actions only. |
| Production business writes | **0** | No business mutation route or online ledger modification. |

## Configuration gate

| Gate | Status | Evidence / exact next action |
| --- | --- | --- |
| HTTPS UAT host | PENDING | No Render credentials/deployment existed. Create the Blueprint from `render.yaml`. |
| Exact OAuth callback | PENDING | After hostname allocation, register `https://<uat-host>/api/auth/feishu/callback` with no wildcard. |
| Read-only spreadsheet scope | PENDING / BLOCKED | Existing real probe showed missing `sheets:spreadsheet:read`; enable only required read scopes and publish the app version. |
| Spreadsheet document access | PENDING | Add the UAT application as a document app/read collaborator, then rerun the checker. |
| Server secrets | PENDING | Populate the host secret manager; no values are committed. |
| Role lists | PENDING | Configure at least READ_ONLY and OPERATOR identities plus an unlisted negative-test user. |
| `READ_ONLY_RELEASE=true` | PENDING EXTERNAL | Required by code and fixed in `render.yaml`; not yet evidenced in a live host. |
| Current real checker result | BLOCKED | `UAT_RUNTIME_CONFIG_INVALID`; designated UAT environment variables are absent. No network/business write occurred. |

## Live UAT gate

| Gate | Status |
| --- | --- |
| Feishu OAuth end-to-end | PENDING |
| Signed session persist/tamper/expiry/logout | PENDING |
| No-session / unlisted / READ_ONLY / OPERATOR role matrix | PENDING |
| Real OpenAPI ledger read | PENDING |
| OpenAPI/CLI exact business parity | PENDING |
| Date and formula transport validation | PENDING |
| Dashboard / Tasks / Layout / Exceptions | PENDING |
| Real XLSX Preview | PENDING |
| Private historical regression | PENDING — `PRIVATE_FIXTURES_NOT_CONFIGURED`, 0 fixtures; Faulty Unit leakage not measured |
| Rate limiting and Feishu H5 security headers | PENDING |
| Client bundle/network secret inspection | PENDING LIVE; automated static boundary PASS |
| Health and safe failure behavior | PENDING LIVE |
| Production business writes | **0** |

The code/tooling gate does not imply deployment or live UAT success. Phase 3 remains blocked until every required external and live row has actual evidence.
