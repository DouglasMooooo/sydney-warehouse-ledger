# Feishu UAT human smoke test

Do this only after the frozen baseline and exact `CURRENT_INVENTORY_BASELINE_EFFECTIVE_AT` are configured.

1. Choose one real, low-risk SN that genuinely needs a move. Record SKU, current location and stock condition.
2. In **库存作业 → 移库**, select a real target location and generate a preview.
3. Verify the before/after fields, then record the command ID and confirm exactly once.
4. Confirm the success result and movement ID. Open the Feishu main ledger: one new row only; SKU, SN, source, target and condition must match; historical rows and protected formula columns must remain unchanged.
5. Return to the app, re-query the SN and verify its current location changed. Verify the operation record is searchable.

Do not use adjustment decrease, batch outbound or batch adjustment as the first live operation. Mark `LIVE_UAT_VERIFIED=YES` only after every item above passes.
