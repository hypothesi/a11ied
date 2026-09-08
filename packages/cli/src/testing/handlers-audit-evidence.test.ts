import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { createTempRoot } from './fixtures.js';
import {
   cleanupTempRoots,
   EXIT_SUCCESS,
   EXIT_USAGE,
   parseJsonOutput,
   runCli,
   TEST_TIMEOUT_MEDIUM,
} from './setup.js';

interface EvidenceLine {
   subject: string;
   test: { kind: string; criterionId: string; procedureId: string };
   outcome: string;
   mode: string;
   pointer?: string;
   assertedBy?: string;
}

const FIXTURE = 'packages/cli/test/fixtures/basic-page.html';
const tempRoots: string[] = [];

afterAll(async () => {
   await cleanupTempRoots(tempRoots);
});

async function createResultsPath(): Promise<string> {
   return join(await createTempRoot(tempRoots), 'evidence.jsonl');
}

async function readLines(path: string): Promise<EvidenceLine[]> {
   const body = await readFile(path, 'utf8');
   return body
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EvidenceLine);
}

async function record(
   results: string,
   args: string[],
   target = FIXTURE,
): Promise<Awaited<ReturnType<typeof runCli>>> {
   return runCli(['audit', 'record', target, ...args, '--results', results]);
}

async function assertRecordWritesOneLine(): Promise<void> {
   const results = await createResultsPath();
   const result = await record(results, [
      '--criterion',
      '2.4.7',
      '--outcome',
      'failed',
      '--pointer',
      'nav > a:nth-child(3)',
      '--by',
      'claude-code',
   ]);
   const lines = await readLines(results);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect(lines).toHaveLength(1);
   expect(lines[0]?.test.criterionId).toBe('2.4.7');
   expect(lines[0]?.outcome).toBe('failed');
   expect(lines[0]?.pointer).toBe('nav > a:nth-child(3)');
   expect(lines[0]?.assertedBy).toBe('claude-code');
}

async function assertManualResultNeverUsesAxeProcedure(): Promise<void> {
   const results = await createResultsPath();
   await record(results, ['--criterion', '2.4.4', '--outcome', 'passed']);
   const lines = await readLines(results);

   expect(lines[0]?.test.procedureId).toBe('manual_review');
}

async function assertProcedureComesFromTheCriterion(): Promise<void> {
   const results = await createResultsPath();
   await record(results, ['--criterion', '2.4.7', '--outcome', 'passed']);
   const lines = await readLines(results);

   expect(lines[0]?.test.procedureId).toBe('focus_visibility_probe');
}

async function assertBadOutcomeIsRejected(): Promise<void> {
   const results = await createResultsPath();
   const result = await record(results, ['--criterion', '2.4.7', '--outcome', 'maybe']);

   expect(result.status).toBe(EXIT_USAGE);
}

async function assertFragmentCollapsesToOneSubject(): Promise<void> {
   const results = await createResultsPath();
   await record(results, ['--criterion', '2.4.7', '--outcome', 'failed'], `${FIXTURE}`);
   await record(results, ['--criterion', '1.4.5', '--outcome', 'passed'], `${FIXTURE}`);
   const lines = await readLines(results);
   const subjects = new Set(lines.map((line) => line.subject));

   expect(subjects.size).toBe(1);
}

async function assertRerecordReplaces(): Promise<void> {
   const results = await createResultsPath();
   await record(results, ['--criterion', '2.4.7', '--outcome', 'failed']);
   await record(results, ['--criterion', '2.4.7', '--outcome', 'passed']);
   const listed = await runCli([
      'audit',
      'pending',
      FIXTURE,
      '--results',
      results,
      '--json',
   ]);
   const pending = parseJsonOutput(listed.stdout).result as {
      pending: Array<{ criterionId: string }>;
   };

   expect(pending.pending.some((entry) => entry.criterionId === '2.4.7')).toStrictEqual(
      false,
   );
}

async function assertPendingSkipsRecordedAndAutomated(): Promise<void> {
   const results = await createResultsPath();
   const before = await runCli([
      'audit',
      'pending',
      FIXTURE,
      '--results',
      results,
      '--json',
   ]);
   const beforeCount = (parseJsonOutput(before.stdout).result as { count: number }).count;

   await record(results, ['--criterion', '2.4.7', '--outcome', 'passed']);
   const after = await runCli([
      'audit',
      'pending',
      FIXTURE,
      '--results',
      results,
      '--json',
   ]);
   const afterCount = (parseJsonOutput(after.stdout).result as { count: number }).count;

   expect(beforeCount).toBeGreaterThan(0);
   expect(afterCount).toBe(beforeCount - 1);
}

async function assertClearRemovesForOneTarget(): Promise<void> {
   const results = await createResultsPath();
   await record(results, ['--criterion', '2.4.7', '--outcome', 'passed']);
   const cleared = await runCli([
      'audit',
      'clear',
      FIXTURE,
      '--results',
      results,
      '--json',
   ]);
   const removed = (parseJsonOutput(cleared.stdout).result as { removed: number })
      .removed;

   expect(removed).toBe(1);
   expect(await readLines(results)).toEqual([]);
}

describe('cli audit record / pending / clear', () => {
   it(
      'records one result as a single JSON line',
      assertRecordWritesOneLine,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'never records a hand-judged result under the axe procedure',
      assertManualResultNeverUsesAxeProcedure,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'defaults the procedure to the one the criterion names',
      assertProcedureComesFromTheCriterion,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'rejects an outcome outside the vocabulary',
      assertBadOutcomeIsRejected,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'keys one target to one subject',
      assertFragmentCollapsesToOneSubject,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'replaces an earlier result for the same check',
      assertRerecordReplaces,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'drops a criterion from pending once it is recorded',
      assertPendingSkipsRecordedAndAutomated,
      TEST_TIMEOUT_MEDIUM,
   );
   it(
      'clears recorded results for one target',
      assertClearRemovesForOneTarget,
      TEST_TIMEOUT_MEDIUM,
   );
});
