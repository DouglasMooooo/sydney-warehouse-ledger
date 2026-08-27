# Feishu UAT human live smoke test

This is a human-only test. Do not create a fake inbound, adjustment, outbound, or batch movement. Use one low-risk, already-approved real **Move** for a serialized machine.

1. Before opening the operation page, use **库存查询** to record the SN, SKU, current location, and stock condition.
2. Open **业务操作 → 移库**, scan or enter that same SN, and choose its approved real target location.
3. Select **Preview**. Record the displayed `commandId`. Confirm the preview shows the correct source location, target location, SN, SKU, and condition.
4. Click **Confirm** once. Record the returned movement ID, written row number, and verification status.
5. In Feishu **库存流水**, inspect only the new row. Confirm: `动作=移库`; SN, SKU, source, target, and stock condition are correct; Remark contains `[SYSTEM_NATIVE]` with the command ID and movement ID.
6. Confirm no older row changed, no formula/helper column was damaged, and only one new business row exists.
7. Return to **库存查询** and confirm the SN now resolves at the target location. Open **操作记录** and confirm the movement is traceable.

Retry check (only with controlled tooling, never by creating another business operation): repeat the same confirmed request with exactly the same `commandId` and payload. It must return `ALREADY_COMMITTED` and must not add a second ledger row.

Do not manually test simultaneous writes. The service is intentionally configured as one instance while it uses a process-local write mutex.
