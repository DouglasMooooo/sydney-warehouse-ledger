# OpenAPI Read Parity

Status: **PENDING LIVE UAT**

No designated UAT OpenAPI credentials or HTTPS deployment were available in the implementation environment, so no real-ledger parity result is claimed. A read-only probe using the locally configured CLI application identity was rejected for missing application-identity `sheets:spreadsheet:read`; it did not reach document-access or parity evaluation, and no permission was changed.

The privacy-safe runner is `npm run uat:openapi-parity`. It compares logical aggregates only for Dashboard, Today Tasks, Warehouse Layout, Current Inventory, Location Master, Exceptions, Pickup Code reads, and—when a private probe SKU is supplied—Product Master and inventory recommendation inputs. It writes the detailed local result under ignored `reports/private/` and never prints identifiers, SKU values, row contents, SNs, customer data, sheet IDs, or tokens.

Work Order XLSX Preview recommendation remains a manual/private UAT check because it requires a private historical XLSX and expected values. Record only aggregate PASS/FAIL evidence after execution.
