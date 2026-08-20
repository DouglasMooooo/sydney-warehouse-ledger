# Phase 2.6 Read-Only Feishu UAT Release Gate

## Code

| Gate | Status | Evidence |
| --- | --- | --- |
| Runtime configuration | PASS | Production Node startup/readiness validates required OpenAPI, auth, roles, HTTPS callback, version, and read-only configuration without secret values. |
| Token cache boundary | PASS | 30/120/600/7200-second TTL tests prove refresh is strictly before expiry. |
| OAuth/session hardening | PASS | PKCE/state, no-store, temporary-cookie clearing, fixed redirect, secure short session, tamper/expiry tests, logout. |
| Login/logout UX | PASS | Explicit Feishu login, unauthorized message, and warehouse-session-only logout. |
| Health/readiness safety | PASS | Safe config/readability separation and degraded 503 behavior. |
| Deep Scan truthfulness | PASS | FULL/PARTIAL/UNAVAILABLE coverage and unavailable-rule suppression. |
| Read-only route gate | PASS | Static scan allows only XLSX preview and deep-scan warehouse POST routes. |
| Security boundary | PASS | Security headers and strengthened client-secret/import static checks. |
| OpenAPI parity tooling | PASS | Privacy-safe aggregate comparator and controlled runner exist. |
| Typecheck | PASS | `npm run typecheck`. |
| Unit/regression tests | PASS | `npm test`: 134 tests passed. |
| Production build | PASS | `npm run build`; route manifest contains no business mutation endpoint. |
| CI | PENDING PUSH | Credential-free workflow will be verified for the final commit. |
| Production business writes | **0** | No business mutation route or online ledger modification. |

## Configuration

| Gate | Status | Evidence |
| --- | --- | --- |
| HTTPS UAT host | PENDING | No deployment platform/host configuration was present. |
| Feishu console application entry/callback | PENDING | Requires external console action. |
| Read-only API scopes | PENDING / BLOCKED | Real application-identity probe was denied for missing `sheets:spreadsheet:read`; no scope was changed. Minimum metadata/range read-only set is documented. |
| Spreadsheet document-app access | PENDING | Scope denial occurred first, so target-document application access is not yet proven. Must be granted and verified by metadata plus range read. |
| Server secrets and role lists | PENDING | No UAT environment variables were present; values are intentionally not committed. |

## Live UAT

| Gate | Status |
| --- | --- |
| Feishu OAuth end-to-end | PENDING |
| Session persist/expiry/logout | PENDING |
| Real OpenAPI ledger read | PENDING |
| Dashboard / Today Tasks / Layout / Exceptions parity | PENDING |
| Formula representative-column validation | PENDING |
| READ_ONLY / OPERATOR / unlisted / no-session scenarios | PENDING |
| Real XLSX preview and recommendation | PENDING |
| Rate-limit behavior | PENDING |
| Private historical fixture regression | PENDING — 0 fixtures |
| Production business writes | **0** |

Code readiness does not mean deployment or live UAT passed. Phase 3 remains blocked until the outstanding configuration and live evidence are reviewed.
