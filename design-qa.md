# Design QA — Scan-and-Resolve Console

## Evidence

- Visual target: `C:\Users\d1571\.codex\generated_images\01a01cd9-51d7-7f42-9767-9c3fbcf23c53\exec-7d89fc7e-a984-4ca1-bd63-2ba7d0f987a0.png`
- Implementation capture: `C:\Users\d1571\OneDrive\文档\飞书\sydney-warehouse-ledger-auth-fix\implementation-operations-v2.png`
- Target canvas: 1487 × 1058
- Browser capture: 1265 × 712 (Codex in-app browser viewport)
- Verified state: real warehouse work order parsed, one fail-closed Product Master blocker visible, manual SN and final-location fields visible, UAT read-only lock visible.

## Full-view comparison

The implementation preserves the selected target's core information architecture: dark horizontal product navigation, a compact UAT/read-only banner, three-column scan-and-resolve workspace, low-radius operational surfaces, restrained green accents, and a persistent line-detail rail. The screen remains dense enough for warehouse work without reverting to spreadsheet-like chrome.

The left rail intentionally uses live controlled-action selectors and the warehouse work-order import instead of the target's illustrative import-history queue because the current system does not persist import jobs. The center table shows the real one-line work-order result rather than fabricated historical rows. The right rail now owns the operational completion gate: automatic pickup code, manual SN entry, manual final-location entry, and an explicit physical-location confirmation.

## Focused checks

- Navigation: “库存操作台”, return, warehouse map, and task destinations are legible and operational.
- Import flow: date input, XLSX chooser, and warehouse work-order CTA are visible without mislabelling the module as a standalone extractor.
- Validation result: row status, available stock, and blocking reason are expressed together.
- Detail rail: selected SKU, quantity, automatically generated pickup code, recommended location, manual SN, and final-location confirmation remain readable.
- Return flow: SN-only batch input produces one quantity-1 REPAIR-01 row per unique SN without requiring an XLSX.
- Warehouse map: `R1-2-3-L` is explicitly decoded as rack 1, row 2, bay 3, left side; rack rows and L/R compartments use a physical hierarchy.
- Safety: all write actions remain visibly locked in UAT.
- Responsive behavior: desktop three-column layout collapses without horizontal page overflow at narrower breakpoints.
- Console: final browser pass reported no console errors or warnings.

## Comparison history

1. Pass 1 found a development CSP error from React Refresh and a capture taken below the top of the page.
2. Added development-only `unsafe-eval` for Next.js refresh, opened a clean browser tab, returned to page top, and recaptured.
3. Pass 2 corrected a quantity placeholder that showed zero when an upstream inventory blocker prevented a proposed row.
4. Final pass confirmed a clean console, correct completion labels, and intact hierarchy. No actionable P0, P1, or P2 visual issues remain.

## Intentional deviations

- The target's fake job history was replaced with real workflow controls and current parser output.
- Live UAT data determines row count and validation status.
- A text wordmark is used until an approved Fox ESS brand asset is added to the repository.

final result: passed
