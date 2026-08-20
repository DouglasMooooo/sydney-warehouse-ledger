# Feishu Mini App Target Boundary

## Target architecture

```text
Feishu Mini App / internal application UI
                 |
                 v
server-controlled Next.js application and explicit APIs
                 |
                 v
existing Feishu warehouse ledger (system of record)
                 |
                 v
existing formulas, reports, and inventory views
```

No second inventory database is planned. Domain validation, normalisation, concurrency checks, and Feishu access remain server-side.

## Client/server security boundary

The browser or Mini App client must never receive a Feishu app secret, tenant token, spreadsheet write credential, raw backend command capability, `lark-cli` access, ledger coordinates, or a generic write primitive. It sends business-shaped DTOs to same-origin, purpose-specific application endpoints and receives the standard `{ ok, data }` or `{ ok, error }` contract.

The current explicit binary preview endpoint is `POST /api/warehouse/work-orders/preview`; the historical `/prepare` compatibility alias was removed for the Phase 2.6 route allowlist. The preview performs zero writes and has no write port. Current endpoints are:

- `GET /api/warehouse/dashboard`
- `POST /api/warehouse/work-orders/preview`
- `GET /api/warehouse/tasks`
- `GET /api/warehouse/layout`
- `GET /api/warehouse/exceptions`
- future `POST /api/warehouse/work-orders/confirm`
- future `POST /api/warehouse/returns/preview` and `/confirm`
- future `POST /api/warehouse/moves/preview` and `/confirm`

Generic endpoints such as `/write-cell`, `/run-command`, and `/sheets-proxy` are forbidden. Static regression checks guard the current preview route against server command, credential, spreadsheet-coordinate, and write-primitive imports. All future confirm endpoints require the existing transaction safety gates and a separate release approval.

## Identity and authorization

`src/auth/` now implements Feishu OAuth identity verification, server-configured roles, and signed 30-minute sessions without hardcoded users or a local password store. OAuth uses state and S256 PKCE; raw codes and Feishu tokens are not stored in client cookies. The roles are:

- `READ_ONLY`: Dashboard, inventory, and task views.
- `WAREHOUSE_OPERATOR`: read permissions plus work-order preview/future confirmation, Return preview/future confirmation, Move preview/future confirmation, and Label generation.
- `WAREHOUSE_ADMIN`: operator permissions plus Adjustment, exception resolution, and controlled configuration.

Local development may construct a clearly marked `DEV_ONLY` identity only when explicitly enabled. Runtime validation rejects that identity in production. Unknown Feishu users fail closed. Defining future permissions does not activate a writer; all current APIs independently check the required read/preview permission.

## Current compatibility report

| Area | Current finding | Deployment requirement |
| --- | --- | --- |
| Server runtime | Production reads use official Feishu OpenAPI; `lark-cli` remains a local/admin adapter. | Use a production Node runtime and `FEISHU_READ_ADAPTER=openapi`; do not deploy the CLI adapter or secrets to an Edge/client runtime. |
| File upload | The client uploads `.xlsx` bytes to an explicit Node server route; ExcelJS decodes in memory with a 5 MiB limit. | Keep decoding server-only and preview-only; do not persist or forward workbooks. |
| Browser APIs | The UI depends on standard `fetch`, `File`, and `FormData`. | Validate upload and cookie behavior in the selected Feishu webview versions. |
| URLs | Client requests are relative and same-origin; no production Feishu URL is bundled into client code. | Preserve same-origin routing or configure an explicit trusted API origin. |
| Authentication | Feishu identity is verified server-side and roles are mapped from server-only stable-ID lists. | Configure callback/login scopes and UAT role lists; missing or insufficient sessions remain 401/403. |
| Environment | OpenAPI and workbook configuration remain in server environment variables. | Keep all secrets and tokens server-only; never use public/client-prefixed variables for credentials. |
| Cookies/session | HMAC-signed, 30-minute, HttpOnly, SameSite=Lax sessions are Secure and `__Host-` prefixed in production. | Rotate the server secret through the host secret manager; add signed intent + Origin/CSRF checks only when Phase 3 mutation routes are reviewed. |
| CSP/embedding | No production CSP, `frame-ancestors`, or Feishu webview allowlist has been configured. | Choose the Feishu Mini App/H5 hosting mode, then set its approved domains and CSP without weakening the server boundary. |
| Routing | The app uses Next.js App Router and server components. | Validate base path, deep links, callback URLs, and navigation inside Feishu before deployment. |

## API and logging contract

Application APIs return either `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "field"? } }`. Client errors do not include stacks, local paths, credentials, or raw thrown values. Server logging is limited to a bounded, redacted technical summary; it must never include tokens, credentials, or full production ledger dumps.

## Release gates

Before read-only Mini App UAT, complete `FEISHU_DEPLOYMENT_CHECKLIST.md`: console app/domain/callback configuration, minimum scopes, document access, production secrets, CSP, HTTPS host, and role lists. Before any confirm/write route, Phase 3 still needs signed short-lived confirmation intents, Origin/CSRF controls, idempotency, concurrency-safe Pickup Code allocation, formula provisioning, typed reread verification, post-write reconciliation, production runtime validation, and explicit release approval.

This document prepares the runtime boundary only. No deployment is claimed and production business writes remain zero.
