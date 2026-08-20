# Phase 2.6 — Read-Only Feishu UAT

## Outcome boundary

Phase 2.6 prepares the existing Next.js application for a real HTTPS Feishu internal H5 UAT. It adds no warehouse feature and enables no business write. Runtime mode is `READ_ONLY_UAT`; `READ_ONLY_RELEASE=true` is mandatory and missing/false configuration fails readiness and production server startup.

The only warehouse POST endpoints are:

- `/api/warehouse/work-orders/preview`
- `/api/warehouse/exceptions/deep-scan`

The historical `/work-orders/prepare` alias was removed. Prepared/Outbound/Return/Move/Adjustment confirmation, Pickup reservation, and committed Label routes do not exist.

## Code gate

- Production runtime validation requires the OpenAPI adapter, HTTPS OAuth callback, server credentials/configuration, all three controlled role lists, a 32+ character session secret, release version, and the read-only flag.
- Tenant tokens refresh between 50% and 80% of declared TTL and always before expiry, including 30/120/600/7200-second TTLs.
- OAuth state and PKCE cookies are HttpOnly, Secure in production, SameSite=Lax, Path=/, five minutes, no-store, and cleared after every callback outcome.
- Callback redirect is fixed to `/dashboard`; no browser-provided return URL is accepted.
- Root login, unauthorized message, and warehouse-session-only logout are present.
- `/api/health` is the combined readiness endpoint. It distinguishes `authConfig`, `openApiConfig`, and actual `ledgerRead`; it returns 503 when not ready and never returns identifiers or raw errors.
- The OpenAPI health check performs both target-spreadsheet metadata and a cell-range read. OAuth success is not treated as spreadsheet access proof.
- Security headers include CSP, `nosniff`, strict-origin referrer policy, and disabled camera/microphone/geolocation.

## Deep quality truthfulness

OpenAPI range reads do not expose authoritative stored-type/number-format metadata or data-validation metadata. Coverage therefore reports:

| Rule | Hosted OpenAPI status | Meaning |
| --- | --- | --- |
| `DATE_STORED_AS_TEXT` | PARTIAL | Unformatted values distinguish numbers from strings, but stored cell metadata/format is unavailable. |
| `HIDDEN_CHARACTER` | FULL | Returned text is checked without normalization. |
| `FORMULA_MISSING` | PARTIAL | Formula rendering is implemented; protected-column semantics still require live UAT evidence. |
| `FORMULA_BROKEN` | PARTIAL | Formula/value dual reads exist; live representative validation remains pending. |
| `VALIDATION_NOT_OK` | UNAVAILABLE | Range reads do not retrieve validation metadata; the rule is suppressed rather than advertised as authoritative. |

Representative formula columns for live validation are H, I, O, Q, R, S, T, W, X, Y, Z, AA, AB, and AC. No live formula validation is claimed in this code-only environment.

## Parity and live UAT

Run `npm run uat:openapi-parity` only in the controlled UAT environment with both trusted local CLI read access and hosted OpenAPI configuration. It compares business aggregates, not transport metadata, and writes the result only under ignored `reports/private/`.

Real XLSX preview, role scenarios, session persistence, rate limiting, live dashboard/tasks/layout/exceptions, and spreadsheet/formula behavior require the deployed HTTPS application and real authorized users. They remain PENDING until executed. Production business writes during this phase remain exactly 0.

## Health versus liveness

One endpoint is intentionally used: `/api/health` is readiness, not a bare process ping. Container/platform process health may use its native process supervision; traffic must not be routed until this endpoint returns 200. This keeps external routing from treating a process with missing configuration or unreadable ledger as ready.
