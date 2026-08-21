# Phase 2.8 Predeployment Snapshot

Snapshot time: 2026-08-21 (Australia/Sydney)

No external configuration change, app creation, permission grant, publication, deployment, spreadsheet write, or business write occurred before or during this snapshot.

| Area | Safe state | Status |
| --- | --- | --- |
| Repository release | Branch `phase1-safe-implementation`, reviewed head `e3e368b` | PASS |
| CLI connection | Feishu CLI 1.0.63; user identity verified enough for a live workbook read; bot credentials configured | PASS |
| Intended dedicated UAT app | No CLI-manageable Sydney Warehouse application was found | PENDING |
| Connected CLI application suitability | General-purpose integration application, not dedicated UAT. User identity exposes 194 scopes and includes spreadsheet create/meta-write/write scopes | FAIL — MUST NOT USE AS UAT APP |
| Application-identity metadata scope | Live bot metadata read rejected for missing `sheets:spreadsheet:read` | FAIL |
| Application-identity range scope | Not tested because metadata scope failed first | PENDING |
| Target spreadsheet user access | Live read-only workbook-structure call succeeded; 16 worksheets visible | PASS (trusted-source identity only) |
| Target spreadsheet app access | Not reached; scope failure occurred before document-access evaluation | PENDING |
| Document-app permissions | Not inspectable through the available CLI capability | PENDING |
| App release/version state | Internal developer-app version management is not exposed by the available CLI | PENDING |
| H5/web entry | Not exposed by the available CLI; developer console requires browser login | PENDING |
| OAuth callback | Not exposed by the available CLI; developer console requires browser login | PENDING |
| HTTPS host | Render definition exists in Git, but Render dashboard is not authenticated and no host exists | PENDING |

The connected application must not be expanded or repurposed for UAT because it already carries explicitly forbidden write-capable user scopes. Create/reuse a separate internal Feishu application whose enabled permission set is limited to the proven read-only needs.
