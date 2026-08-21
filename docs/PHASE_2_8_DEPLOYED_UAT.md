# Phase 2.8 — CLI-Assisted Deployment and Live Read-Only UAT

## Actual state

The target architecture remains a Feishu internal H5/web application opening one HTTPS Node/Next.js service, which reads the existing Feishu ledger through server-side OpenAPI. There is no second inventory database and no business write path.

The CLI performed a real trusted-user workbook structure read, proving the current user can access the target workbook. A separate bot/application-identity read failed at the metadata scope layer, before document access. The connected CLI application is a broad general-purpose integration application with spreadsheet write-capable user scopes, so it is rejected as the dedicated UAT application.

No real HTTPS host or dedicated internal UAT application has yet been created. Both the Feishu developer console and Render dashboard require an authenticated browser session that was not present in the execution environment.

## Required external continuation

1. Sign in to the Feishu developer console and Render dashboard in the controlled browser session.
2. In Feishu, locate an existing dedicated Sydney Warehouse UAT internal application or create exactly one. Do not reuse the broad CLI integration application.
3. In Render, create the single-instance Blueprint from `render.yaml` and the exact release commit.
4. Store server-only environment values in Render. The Admin role key may be empty; Operator and Read Only must each contain at least one UAT identity.
5. Enable only the minimum application-identity read scopes demonstrated by the metadata and range endpoints. Grant no spreadsheet, document, or drive write permission.
6. Add the dedicated application as a read-only document app/collaborator on the target spreadsheet.
7. Register the exact Render HTTPS entry and callback, publish only to intended UAT testers, then run the configuration checker.
8. Continue to health, OAuth, role, parity, UI, XLSX, rate-limit, H5, and security UAT only after the checker fully passes.

## Rollback

- Retain the prior Render deployment and keep one UAT instance.
- Disable or remove the UAT app version from tester availability.
- Revoke the dedicated application's target-spreadsheet access.
- Remove all UAT role entries and rotate server-side session/app secrets if exposure is suspected.
- Suspend/delete the UAT Render service only after retaining required diagnostic evidence; no ledger rollback is needed because business writes remain zero.

## Safety boundary

Only Work Order Preview and explicit Deep Scan remain allowed warehouse POST operations. Prepared, Outbound, Return, Move, Adjustment, Pickup reservation, Label confirmation, and AI-triggered ledger writes remain unavailable. Phase 3 is not authorized.
