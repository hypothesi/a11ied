import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTempRoot } from './fixtures.js';
import {
   cleanupTempRoots,
   createTestServer,
   EXIT_ASSERTION,
   runCli,
   TEST_TIMEOUT_LONG,
   type TestServerHandle,
} from './setup.js';

interface EarlAssertion {
   '@type': string;
   mode?: string;
   subject: { '@type': string[]; source: string };
   assertedBy: string;
   result: { '@type': string; outcome: string; pointer?: string };
   test?: { '@type': string; title: string; '@id'?: string; isPartOf: string[] };
}

interface EarlReport {
   '@context': string;
   '@graph': EarlAssertion[];
}

const testServer: TestServerHandle = createTestServer();
const tempRoots: string[] = [];

beforeAll(async () => {
   await testServer.start();
});

afterAll(async () => {
   await testServer.stop();
   await cleanupTempRoots(tempRoots);
});

async function runEarl(baseUrl: string): Promise<{ report: EarlReport; status: number }> {
   const tempRoot = await createTempRoot(tempRoots);
   const outPath = join(tempRoot, 'report.earl.json');
   const result = await runCli([
      'axe',
      `${baseUrl}/button-name-failure.html`,
      '--criterion',
      '4.1.2',
      '--format',
      'earl',
      '--out',
      outPath,
   ]);

   const report = JSON.parse(await readFile(outPath, 'utf8')) as EarlReport;
   expect(result.stdout).toBe('');
   return { report, status: result.status };
}

async function assertWritesTheActContext(baseUrl: string): Promise<void> {
   const { report } = await runEarl(baseUrl);

   expect(report['@context']).toBe(
      'https://www.w3.org/WAI/content-assets/wcag-act-rules/earl-context.json',
   );
   expect(report['@graph'].length).toBeGreaterThan(0);
}

async function assertEveryNodeIsAnAssertion(baseUrl: string): Promise<void> {
   const { report } = await runEarl(baseUrl);

   expect([...new Set(report['@graph'].map((entry) => entry['@type']))]).toEqual([
      'Assertion',
   ]);
   expect(
      report['@graph'].every((entry) => entry.subject.source.includes('button-name')),
   ).toStrictEqual(true);
}

async function assertReportsTheFailure(baseUrl: string): Promise<void> {
   const { report, status } = await runEarl(baseUrl);
   const failed = report['@graph'].filter(
      (entry) => entry.result.outcome === 'earl:failed',
   );

   expect(status).toBe(EXIT_ASSERTION);
   expect(failed.length).toBeGreaterThan(0);
   expect(failed[0]?.test?.title).toBe('button-name');
   expect(failed[0]?.test?.isPartOf).toContain('WCAG2:name-role-value');
}

async function assertOutcomesUseTheEarlPrefix(baseUrl: string): Promise<void> {
   const { report } = await runEarl(baseUrl);
   const outcomes = new Set(report['@graph'].map((entry) => entry.result.outcome));

   expect([...outcomes].every((outcome) => outcome.startsWith('earl:'))).toStrictEqual(
      true,
   );
}

describe('cli axe --format earl', () => {
   it(
      'writes the W3C ACT context',
      async () => {
         await assertWritesTheActContext(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
   it(
      'writes a flat graph of assertions for one subject',
      async () => {
         await assertEveryNodeIsAnAssertion(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
   it(
      'reports the failing rule and its success criterion',
      async () => {
         await assertReportsTheFailure(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
   it(
      'prefixes every outcome with earl:',
      async () => {
         await assertOutcomesUseTheEarlPrefix(testServer.getBaseUrl());
      },
      TEST_TIMEOUT_LONG,
   );
});
