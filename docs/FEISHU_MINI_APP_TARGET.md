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

The current explicit binary preview endpoint is `POST /api/warehouse/work-orders/preview`; the historical `/prepare` endpoint remains a text-preview compatibility alias. Both perform preview only and have no write port. Current endpoints are:

- `GET /api/warehouse/dashboard`
- `POST /api/warehouse/work-orders/preview`
- `GET /api/warehouse/tasks`
- `GET /api/warehouse/layout`
- `GET /api/warehouse/exceptions`
- future `POST /api/warehouse/work-orders/confirm`
- future `POST /api/warehouse/returns/preview` and `/confirm`
- future `POST /api/warehouse/moves/preview` and `/confirm`

Generic endpoints such as `/write-cell`, `/run-command`, and `/sheets-proxy` are forbidden. Static regression checks guard the current preview route against server command, credential, spreadsheet-coordinate, and write-primitive imports. All future confirm endpoints require the existing transaction safety gates and a separate release approval.

## Identity and authorization target

`src/auth/` defines a future Feishu identity adapter and an application auth context without hardcoded users or a local password store. The roles are:

- `READ_ONLY`: Dashboard, inventory, and task views.
- `WAREHOUSE_OPERATOR`: read permissions plus work-order preview/future confirmation, Return preview/future confirmation, Move preview/future confirmation, and Label generation.
- `WAREHOUSE_ADMIN`: operator permissions plus Adjustment, exception resolution, and controlled configuration.

Local development may construct a clearly marked `DEV_ONLY` identity. Runtime validation rejects that identity in production. Defining permissions does not activate any writer; each server operation must still check the required permission when it is implemented.

## Current compatibility report

| Area | Current finding | Deployment requirement |
| --- | --- | --- |
| Server runtime | Feishu access uses Node-only `child_process`, filesystem/path modules, and a locally authenticated `lark-cli`. | Use a long-running Node host with the CLI installed and authenticated, or later replace only the server adapter with official server-side OpenAPI. Do not deploy this adapter to Edge/serverless runtimes that lack those capabilities. |
| File upload | The client uploads `.xlsx` bytes to an explicit Node server route; ExcelJS decodes in memory with a 5 MiB limit. | Keep decoding server-only and preview-only; do not persist or forward workbooks. |
| Browser APIs | The UI depends on standard `fetch` and `File.text()` only. | Validate those APIs in the selected Feishu webview versions. |
| URLs | Client requests are relative and same-origin; no production Feishu URL is bundled into client code. | Preserve same-origin routing or configure an explicit trusted API origin. |
| Authentication | Every current page/API checks a permission. Development/test use `DEV_ONLY`; production rejects requests because real Feishu session binding is not configured. | Verify Feishu launch identity server-side and establish a secure, short-lived session before deployment or any confirm endpoint. |
| Environment | Feishu workbook configuration remains in server environment variables and an authenticated CLI session. | Keep all secrets and tokens server-only; never use public/client-prefixed variables for credentials. |
| Cookies/session | No production cookie or session implementation exists. | Add Secure, HttpOnly, SameSite-appropriate session handling and CSRF protection for mutations. |
| CSP/embedding | No production CSP, `frame-ancestors`, or Feishu webview allowlist has been configured. | Choose the Feishu Mini App/H5 hosting mode, then set its approved domains and CSP without weakening the server boundary. |
| Routing | The app uses Next.js App Router and server components. | Validate base path, deep links, callback URLs, and navigation inside Feishu before deployment. |

## API and logging contract

Application APIs return either `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message", "field"? } }`. Client errors do not include stacks, local paths, credentials, or raw thrown values. Server logging is limited to a bounded, redacted technical summary; it must never include tokens, credentials, or full production ledger dumps.

## Release gates

Before Mini App deployment or any confirm/write route, the project still needs real Feishu identity verification, endpoint permission enforcement, secure sessions and CSRF controls, signed short-lived preview tokens, idempotency, concurrency-safe Pickup Code allocation, formula provisioning, typed reread verification, post-write reconciliation, production runtime validation, and explicit release approval.

This document prepares the runtime boundary only. No deployment and no production business write are part of this iteration.
