# Phase 2.8 — CLI-Assisted Deployment and Live Read-Only UAT

## Actual state

The dedicated `Sydney Warehouse UAT` Feishu internal web application and the Render Free web service now exist. Render is serving the exact release commit from `phase1-safe-implementation` at `https://sydney-warehouse-ledger-uat.onrender.com`. The Feishu desktop/mobile entry and OAuth callback point to that host.

The UAT application has only spreadsheet read and spreadsheet readonly scopes. It has no spreadsheet write scope, no external bot sharing, and no business write route. Its version `1.0.1` is approved and limited to the intended UAT testers.

The rotated application credential successfully obtains a tenant token, and Render now contains the intended spreadsheet token and sheet IDs. Ledger readiness is nevertheless blocked: on 2026-08-22, both the metadata read and an attempt to re-add the application collaborator established that the target spreadsheet token resolves to a deleted resource (`1063005 Resource is deleted`). The health endpoint therefore correctly returns a safe HTTP 503 instead of stale or fabricated data.

No inventory row, formula, date, view, workflow, or other business data was written.

## Vercel visual preview

`https://sydney-warehouse-ledger-uat.vercel.app` hosts a visual-only deployment for early UI review. `WAREHOUSE_VISUAL_DEMO=true` permits anonymous read-only navigation only when `READ_ONLY_RELEASE=true` and every live Feishu credential, spreadsheet identifier, role mapping, and session secret is absent. The screens use clearly marked `DEMO-*` sample values and hide operator-only work-order preview and deep-scan actions. Render remains the configured Feishu UAT host until a separate secret migration and callback change are explicitly approved.

The Vercel project is connected to this GitHub repository. `.vercelignore` excludes local build output, local configuration, dependencies, and the preserved stale Next.js directory from deployment uploads.

## Required external continuation

1. Restore the deleted target spreadsheet, or provide a replacement Feishu spreadsheet URL with the required warehouse tabs.
2. Update the server-only spreadsheet token and sheet IDs if a replacement is used, then add the dedicated application as a document collaborator with the explicitly approved permission.
3. Confirm the dedicated application can query spreadsheet metadata and read a minimal range. Retain only status/type evidence; do not retain business cell contents.
4. Require `/api/health` to return ready before starting OAuth and role tests.
5. Run no-session, unlisted-user denial, READ_ONLY, OPERATOR, logout, parity, H5 desktop/mobile, security, rate-limit, and private-XLSX UAT.
6. Keep the final Phase 2.8 verdict blocked unless every required gate has evidence.

## Rollback

- Disable or remove the UAT app version from tester availability.
- Revoke the dedicated application's target-spreadsheet `view` access after it is created.
- Remove UAT role entries and rotate server-side session/application secrets if exposure is suspected.
- Roll Render back to the preceding successful deploy or suspend the UAT service.
- No ledger rollback is needed because business writes remain zero.

## Safety boundary

Only Work Order Preview and explicit Deep Scan remain allowed warehouse POST operations. Prepared, Outbound, Return, Move, Adjustment, Pickup reservation, Label confirmation, and AI-triggered ledger writes remain unavailable. Phase 3 is not authorized.
