# Feishu UAT ship checklist

Run this checklist against the deployed UAT environment. Do not use a real warehouse movement merely to complete it.

| Check | Required evidence | Status |
| --- | --- | --- |
| Authentication | Feishu login produces a human session | Pending UAT operator check |
| Feishu read | `/api/health` reports `ledgerRead: ok` | Automated deployment check |
| Ledger schema | `npm run deploy:feishu:check` reports `operationalLedgerSchema: PASS` | Pending deployed environment check |
| Ledger writer | Writer config and schema guard both pass; no test movement is created | Pending deployed environment check |
| Idempotency | Automated writer regression test | PASS in CI |
| Re-read verification | Automated typed-value/date/formula regression test | PASS in CI |
| Inbound / Move / Prepare / Outbound / Return / Adjustment | Operator runs Preview → Confirm using approved UAT records only | Pending UAT operator check |
| AI mutation blocked | Automated route capability test | PASS in CI |
| Migration persistence disabled | Feature-policy regression test | PASS in CI |
| Desktop / tablet UI | Operator smoke check at 1366px and 1024px | Pending UAT operator check |

The actual business confirmation is the only permitted live-write smoke test, and must be performed by an authenticated warehouse user.
