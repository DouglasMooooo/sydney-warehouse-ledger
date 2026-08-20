# Independent review guide

This repository is published so external GPT, Claude, Codex, and human reviewers can challenge the design before production implementation.

## Requested review questions

1. Do the write standards reliably preserve Feishu date, number, and text types?
2. Are historical exceptions kept detect-only, without accidental cleanup?
3. Is the formula-gap repair scope narrow enough to protect fixed history?
4. Is the proposed warehouse-layout helper compatible with Feishu and able to show empty, single-SKU, mixed-SKU, and container cases?
5. Can Today Task views be derived from existing fields without a duplicate Status system?
6. Are exception rules deterministic and lightweight?
7. Do dashboard metrics use dynamic source ranges rather than stale fixed limits?
8. Are weekly and monthly reconciliation gates sufficient?
9. Does the design accidentally introduce ERP/WMS integration or a parallel inventory database?
10. What failure modes, race conditions, or formula-compatibility risks remain?

## Preferred issue format

- Severity: critical / high / medium / low
- Document and section
- Evidence
- Operational impact
- Minimal recommended change
- Reconciliation/test required

Please avoid recommendations that require access to production data. If evidence is missing, identify the exact sanitized fixture or metadata needed.

