import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import type { EvidenceRecord } from '@a11ied/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveEvidenceFile } from './paths.js';
import { appendEvidence, clearEvidence, readEvidence, recordEvidence } from './store.js';
import { stripFragment } from './subject.js';
import { createEvidenceTestAssessment } from './test-fixtures.js';

const roots: string[] = [];

const SINGLE_RECORD = 1;
const TWO_RECORDS = 2;
const CONCURRENT_APPENDS = 60;
const LONG_NOTE_LENGTH = 5000;
const NOTE_UNDER_CAP_LENGTH = 1500;
const NOTE_CAP = 2000;

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createFile(): Promise<string> {
   const root = await mkdtemp(join(tmpdir(), 'a11ied-evidence-'));
   roots.push(root);
   return join(root, 'evidence.jsonl');
}

function buildRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
   return {
      subject: 'https://shop.test/cart',
      test: { kind: 'criterion', criterionId: '2.4.4', procedureId: 'wcag_2_4_4' },
      outcome: 'failed',
      mode: 'semiAutomatic',
      recordedAt: '2026-09-07T21:14:02.114Z',
      ...overrides,
   };
}

async function assertRoundTrips(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord(), { file });
   const records = await readEvidence({ file });

   expect(records).toHaveLength(1);
   expect(records[0]?.test).toEqual({
      kind: 'criterion',
      criterionId: '2.4.4',
      procedureId: 'wcag_2_4_4',
   });
   expect(records[0]?.outcome).toStrictEqual('failed');
}

async function assertMissingFileReadsEmpty(): Promise<void> {
   const file = await createFile();

   expect(await readEvidence({ file })).toEqual([]);
}

async function assertOneLinePerRecord(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord(), { file });
   await appendEvidence(
      buildRecord({
         test: { kind: 'criterion', criterionId: '1.4.2', procedureId: 'wcag_1_4_2' },
         outcome: 'passed',
      }),
      {
         file,
      },
   );
   const body = await readFile(file, 'utf8');
   const lines = body.split('\n').filter(Boolean);

   expect(lines).toHaveLength(TWO_RECORDS);
   expect(lines.every((line) => JSON.parse(line))).toStrictEqual(true);
}

async function assertRerecordReplaces(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord({ outcome: 'failed' }), { file });
   await appendEvidence(buildRecord({ outcome: 'passed' }), { file });
   const records = await readEvidence({ file });

   expect(records).toHaveLength(1);
   expect(records[0]?.outcome).toStrictEqual('passed');
}

async function assertPointerSeparatesRecords(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord({ pointer: 'nav a:nth-child(1)' }), { file });
   await appendEvidence(buildRecord({ pointer: 'nav a:nth-child(2)' }), { file });

   expect(await readEvidence({ file })).toHaveLength(TWO_RECORDS);
}

async function assertBadLineIsReported(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord(), { file });
   await writeFile(file, `${await readFile(file, 'utf8')}not json at all\n`, 'utf8');

   await expect(readEvidence({ file })).rejects.toThrow(`${file}:2:`);
}

async function assertConcurrentAppendsDoNotInterleave(): Promise<void> {
   const file = await createFile();
   const note = 'x'.repeat(NOTE_UNDER_CAP_LENGTH);
   await Promise.all(
      Array.from({ length: CONCURRENT_APPENDS }, (_unused, index) =>
         appendEvidence(
            buildRecord({
               test: {
                  kind: 'criterion',
                  criterionId: '2.4.4',
                  procedureId: 'wcag_2_4_4',
               },
               note,
               pointer: `#link-${index}`,
            }),
            { file },
         ),
      ),
   );

   expect(await readEvidence({ file })).toHaveLength(CONCURRENT_APPENDS);
}

async function assertClearBySubject(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord(), { file });
   await appendEvidence(buildRecord({ subject: 'https://shop.test/checkout' }), { file });
   const removed = await clearEvidence('https://shop.test/cart', { file });
   const records = await readEvidence({ file });

   expect(removed).toStrictEqual(1);
   expect(records).toHaveLength(1);
   expect(records[0]?.subject).toStrictEqual('https://shop.test/checkout');
}

async function assertClearEverything(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord(), { file });
   await appendEvidence(buildRecord({ subject: 'https://shop.test/checkout' }), { file });

   expect(await clearEvidence(undefined, { file })).toStrictEqual(TWO_RECORDS);
   expect(await readEvidence({ file })).toEqual([]);
}

async function assertLongNoteIsTruncated(): Promise<void> {
   const file = await createFile();
   await appendEvidence(buildRecord({ note: 'y'.repeat(LONG_NOTE_LENGTH) }), { file });
   const records = await readEvidence({ file });

   expect(records[0]?.note?.length).toStrictEqual(NOTE_CAP);
}

describe('evidence store', () => {
   it('writes and reads one record', assertRoundTrips);
   it('reads an empty list when nothing was recorded', assertMissingFileReadsEmpty);
   it('writes one JSON line per record', assertOneLinePerRecord);
   it('replaces an earlier result for the same check', assertRerecordReplaces);
   it('keeps results for different elements apart', assertPointerSeparatesRecords);
   it('reports the file and line for corrupt evidence', assertBadLineIsReported);
   it('does not interleave concurrent appends', assertConcurrentAppendsDoNotInterleave);
   it('clears results for one target', assertClearBySubject);
   it('clears every result when no target is given', assertClearEverything);
   it('truncates a note past the cap', assertLongNoteIsTruncated);
});

describe('resolveEvidenceFile', () => {
   it('prefers an explicit path over the environment', () => {
      const resolved = resolveEvidenceFile('/tmp/custom.jsonl', {
         A11IED_EVIDENCE: '/tmp/from-env.jsonl',
      });

      expect(resolved).toStrictEqual('/tmp/custom.jsonl');
   });

   it('falls back to the environment, then the working directory', () => {
      expect(
         resolveEvidenceFile(undefined, { A11IED_EVIDENCE: '/tmp/env.jsonl' }),
      ).toStrictEqual('/tmp/env.jsonl');
      expect(resolveEvidenceFile(undefined, {})).toContain('.a11ied/evidence.jsonl');
   });
});

describe('stripFragment', () => {
   it('drops a fragment so one page has one key', () => {
      expect(stripFragment('https://shop.test/cart#top')).toStrictEqual(
         'https://shop.test/cart',
      );
      expect(stripFragment('https://shop.test/cart')).toStrictEqual(
         'https://shop.test/cart',
      );
   });

   it('reads a line written before a result could be about anything but a criterion', async () => {
      const file = await createFile();
      const legacy = {
         subject: 'https://shop.test/cart',
         criterionId: '2.4.4',
         procedureId: 'wcag_2_4_4',
         outcome: 'passed',
         mode: 'manual',
         recordedAt: '2026-09-07T21:14:02.114Z',
      };
      await writeFile(file, `${JSON.stringify(legacy)}\n`, 'utf8');

      const records = await readEvidence({ file });

      expect(records[0]?.test).toEqual({
         kind: 'criterion',
         criterionId: '2.4.4',
         procedureId: 'wcag_2_4_4',
      });
   });

   it('keeps a criterion result and a pattern row result about the same page apart', async () => {
      const file = await createFile();
      await appendEvidence(buildRecord(), { file });
      await appendEvidence(
         buildRecord({
            test: {
               kind: 'patternRow',
               exampleId: 'combobox-select-only',
               rowKey: 'combobox-key-home[5]',
            },
            outcome: 'inapplicable',
         }),
         { file },
      );

      expect(await readEvidence({ file })).toHaveLength(TWO_RECORDS);
   });
});

describe('recordEvidence conflict detection under lock', () => {
   it('rejects conflicting outcomes for the same check attempt under lock', async () => {
      const fixture = await createEvidenceTestAssessment();
      roots.push(dirname(fixture.runFile));

      await recordEvidence(fixture.record, {
         file: fixture.file,
         runFile: fixture.runFile,
      });

      const conflictingRecord = {
         ...fixture.record,
         outcome: 'failed' as const,
      };

      await expect(
         recordEvidence(conflictingRecord, {
            file: fixture.file,
            runFile: fixture.runFile,
         }),
      ).rejects.toThrowError(
         expect.objectContaining({
            code: 'audit-evidence-conflict',
         }),
      );
   });

   it('serializes concurrent records and rejects conflicting outcome on race', async () => {
      const fixture = await createEvidenceTestAssessment();
      roots.push(dirname(fixture.runFile));

      const passRecord = { ...fixture.record, outcome: 'passed' as const };
      const failRecord = { ...fixture.record, outcome: 'failed' as const };

      const outcomes = await Promise.allSettled([
         recordEvidence(passRecord, { file: fixture.file, runFile: fixture.runFile }),
         recordEvidence(failRecord, { file: fixture.file, runFile: fixture.runFile }),
      ]);

      const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
      const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');

      expect(fulfilled).toHaveLength(SINGLE_RECORD);
      expect(rejected).toHaveLength(SINGLE_RECORD);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
         code: 'audit-evidence-conflict',
      });
   });
});
