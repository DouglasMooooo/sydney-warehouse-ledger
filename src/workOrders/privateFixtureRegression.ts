import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ExcelJsWorkbookReader } from './excelJsReader.js';
import { XlsxWorkOrderParser } from './xlsxParser.js';

export interface PrivateFixtureExpectation {
  file: string;
  expectedSh?: string;
  replacementLines: Array<{ sku: string; qty: number; erpWarehouse: string }>;
}

export interface PrivateFixtureResult { fixture: string; outcome: 'PASS' | 'NEEDS_CONFIRMATION' | 'FAIL' }
export interface PrivateFixtureSummary {
  totalFixtures: number;
  exactPass: number;
  needsConfirmation: number;
  unexpectedFailure: number;
  results: PrivateFixtureResult[];
}

export async function runPrivateFixtureRegression(root: string): Promise<PrivateFixtureSummary> {
  const absoluteRoot = resolve(root);
  const manifest = JSON.parse(readFileSync(join(absoluteRoot, 'manifest.json'), 'utf8')) as PrivateFixtureExpectation[];
  if (!Array.isArray(manifest)) throw new Error('PRIVATE_FIXTURE_MANIFEST_INVALID');
  const parser = new XlsxWorkOrderParser(new ExcelJsWorkbookReader());
  const results: PrivateFixtureResult[] = [];
  for (let index = 0; index < manifest.length; index += 1) {
    const expected = manifest[index]!;
    const safeName = `fixture-${String(index + 1).padStart(3, '0')}`;
    try {
      const filePath = resolve(absoluteRoot, expected.file);
      if (!filePath.startsWith(`${absoluteRoot}\\`) && !filePath.startsWith(`${absoluteRoot}/`)) throw new Error('PRIVATE_FIXTURE_PATH_ESCAPE');
      const parsed = await parser.parse({ bytes: new Uint8Array(readFileSync(filePath)) });
      const actualLines = parsed.replacementLines.map(({ sku, qty, erpWarehouse }) => ({ sku, qty, erpWarehouse }));
      const exact = (expected.expectedSh === undefined || parsed.shNo === expected.expectedSh) && JSON.stringify(actualLines) === JSON.stringify(expected.replacementLines);
      results.push({ fixture: safeName, outcome: exact && parsed.confidence === 'high' ? 'PASS' : parsed.confidence === 'needs_confirmation' ? 'NEEDS_CONFIRMATION' : 'FAIL' });
    } catch { results.push({ fixture: safeName, outcome: 'FAIL' }); }
  }
  return {
    totalFixtures: results.length,
    exactPass: results.filter((item) => item.outcome === 'PASS').length,
    needsConfirmation: results.filter((item) => item.outcome === 'NEEDS_CONFIRMATION').length,
    unexpectedFailure: results.filter((item) => item.outcome === 'FAIL').length,
    results,
  };
}
