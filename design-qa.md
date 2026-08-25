# Design QA — Scan-and-Resolve Console

## Evidence

- Visual target: `C:\Users\d1571\.codex\generated_images\01a01cd9-51d7-7f42-9767-9c3fbcf23c53\exec-7d89fc7e-a984-4ca1-bd63-2ba7d0f987a0.png`
- Implementation capture: `C:\Users\d1571\OneDrive\文档\飞书\sydney-warehouse-ledger-auth-fix\implementation-work-orders.png`
- Target canvas: 1487 × 1058
- Browser capture: 1265 × 712 (Codex in-app browser viewport)
- Verified state: real RMA workbook parsed, Replacement-only result visible, one fail-closed Product Master blocker, UAT read-only lock visible.

## Full-view comparison

The implementation preserves the selected target's core information architecture: dark horizontal product navigation, a compact UAT/read-only banner, three-column scan-and-resolve workspace, low-radius operational surfaces, restrained green accents, and a persistent line-detail rail. The screen remains dense enough for warehouse work without reverting to spreadsheet-like chrome.

The left rail intentionally uses the live controlled-action selectors and import controls instead of the target's illustrative import-history queue because the current system does not persist import jobs. The center table shows the real one-line RMA result rather than fabricated historical rows.

## Focused checks

- Navigation: active module, work-order, return, inventory, and task destinations are legible and operational.
- Import flow: date input, XLSX chooser, and Replacement-only import CTA are visible without ambiguity.
- Validation result: row status, available stock, and blocking reason are expressed together.
- Detail rail: selected SKU, quantity, recommended location, stock availability, and warning remain readable.
- Safety: all write actions remain visibly locked in UAT.
- Responsive behavior: desktop three-column layout collapses without horizontal page overflow at narrower breakpoints.
- Console: final browser pass reported no console errors or warnings.

## Comparison history

1. Pass 1 found a development CSP error from React Refresh and a capture taken below the top of the page.
2. Added development-only `unsafe-eval` for Next.js refresh, opened a clean browser tab, returned to page top, and recaptured.
3. Final pass confirmed a clean console and intact hierarchy. No actionable P0, P1, or P2 visual issues remain.

## Intentional deviations

- The target's fake job history was replaced with real workflow controls and current parser output.
- Live UAT data determines row count and validation status.
- A text wordmark is used until an approved Fox ESS brand asset is added to the repository.

## Result

passed
