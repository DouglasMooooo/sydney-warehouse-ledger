import { buildSnReplayAudit } from '../application/queries/snReplayAudit.js';
import { DeterministicMovementProjectionService } from '../domain/movement/movementProjection.js';
import { DefaultMigrationPolicy, FEISHU_OPERATIONAL_SOURCE_BATCHES } from '../domain/movement/migrationPolicy.js';
import { warehouseReadAdapterFromEnv } from '../feishu/warehouseReadAdapter.js';

// Read-only by construction: this runner depends only on the warehouse read adapter and pure projection/replay services.
const adapter=warehouseReadAdapterFromEnv();
const [records,currentInventory]=await Promise.all([adapter.readLedgerRecords(),adapter.readCurrentInventory()]);
const projection=new DeterministicMovementProjectionService(new DefaultMigrationPolicy(undefined,FEISHU_OPERATIONAL_SOURCE_BATCHES)).projectLedgerRecords(records);
const report=buildSnReplayAudit(projection.movements,currentInventory,projection.issues,projection.unknownActions);
console.log(JSON.stringify(report,null,2));
