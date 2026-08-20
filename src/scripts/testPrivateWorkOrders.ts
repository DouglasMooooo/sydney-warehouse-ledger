import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { runPrivateFixtureRegression } from '../workOrders/privateFixtureRegression.js';

const root = 'tests/fixtures/work-orders/private';
if (!existsSync(`${root}/manifest.json`)) {
  console.log(JSON.stringify({ status: 'PRIVATE_FIXTURES_NOT_CONFIGURED', totalFixtures: 0 }));
  process.exit(0);
}
const summary = await runPrivateFixtureRegression(root);
mkdirSync('reports/private', { recursive: true });
writeFileSync('reports/private/work-order-regression-summary.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
for (const result of summary.results) console.log(`${result.fixture}: ${result.outcome}`);
console.log(JSON.stringify({ totalFixtures: summary.totalFixtures, exactPass: summary.exactPass, needsConfirmation: summary.needsConfirmation, unexpectedFailure: summary.unexpectedFailure }));
if (summary.needsConfirmation > 0 || summary.unexpectedFailure > 0) process.exitCode = 1;
