import { authenticateWarehousePage } from '../../../src/auth/pageAuth';
import { AuditClient } from './audit-client';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await authenticateWarehousePage('TASK_READ');
  return <AuditClient />;
}
