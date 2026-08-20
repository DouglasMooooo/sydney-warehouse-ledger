import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { captureSnapshot, loadSnapshot, reconcileSnapshots, reconciliationMarkdown, saveSnapshot } from '../ledger/reconciliation.js';
import { productionConfig } from './config.js';

if (!existsSync('.phase1/before.json')) throw new Error('Missing BEFORE snapshot');
const before = loadSnapshot('.phase1/before.json');
const after = captureSnapshot(productionConfig());
saveSnapshot('.phase1/after.json', after);
const items = reconcileSnapshots(before, after);
mkdirSync('reports', { recursive: true });
writeFileSync('reports/phase1-reconciliation.md', reconciliationMarkdown(items, after.capturedAt), 'utf8');
const failures = items.filter((item) => item.status === 'FAIL');
console.log(JSON.stringify({ status: failures.length === 0 ? 'PASS' : 'FAIL', failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
