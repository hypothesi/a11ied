import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { appendEvidence } from './store.js';
import { listPendingCriteria } from './pending.js';

describe('procedure coverage', () => {
   it('keeps explicit catalog gaps pending despite imported passing judgments', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-coverage-gap-')),
         file = join(directory, 'evidence.jsonl'),
         subject = 'https://createdbyfireside.com/';
      try {
         await writeFile(
            file,
            `${JSON.stringify({
               subject,
               test: {
                  kind: 'criterion',
                  criterionId: '2.4.13',
                  procedureId: 'focus_obscured_probe',
               },
               outcome: 'passed',
               mode: 'manual',
               recordedAt: new Date().toISOString(),
            })}\n`,
         );
         const pending = await listPendingCriteria({ subject, file, level: 'AAA' });

         expect(
            pending.find((entry) => entry.criterionId === '2.4.13')?.procedureIds,
         ).to.eql(['coverage-gap:2.4.13']);
      } finally {
         await rm(directory, { recursive: true, force: true });
      }
   });
});

describe('legacy procedure coverage', () => {
   it('keeps legacy judgments visibly pending', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-pending-')),
         file = join(directory, 'evidence.jsonl'),
         subject = 'https://example.test/';
      try {
         await writeFile(
            file,
            `${JSON.stringify({
               subject,
               test: {
                  kind: 'criterion',
                  criterionId: '1.1.1',
                  procedureId: 'manual_review',
               },
               outcome: 'passed',
               mode: 'manual',
               recordedAt: new Date().toISOString(),
            })}\n`,
         );
         const pending = await listPendingCriteria({ subject, file, level: 'A' });

         expect(
            pending.find((entry) => entry.criterionId === '1.1.1')?.procedureIds,
         ).to.eql(['wcag_1_1_1']);
      } finally {
         await rm(directory, { recursive: true, force: true });
      }
   });
});

describe('audit run isolation', () => {
   it('keeps evidence from a different run out of a fresh run', async () => {
      const directory = await mkdtemp(join(tmpdir(), 'a11ied-evidence-runs-')),
         oldFile = join(directory, 'old.jsonl'),
         subject = 'https://example.test/';
      try {
         await appendEvidence(
            {
               subject,
               test: {
                  kind: 'criterion',
                  criterionId: '2.4.7',
                  procedureId: 'focus_visibility_probe',
               },
               outcome: 'passed',
               mode: 'manual',
               recordedAt: '2025-01-01T00:00:00.000Z',
            },
            { file: oldFile },
         );
         const pending = await listPendingCriteria({
               subject,
               file: join(directory, 'new.jsonl'),
               level: 'AA',
            }),
            resumed = await listPendingCriteria({ subject, file: oldFile, level: 'AA' });

         expect(pending.some((entry) => entry.criterionId === '2.4.7')).toStrictEqual(
            true,
         );
         expect(resumed.some((entry) => entry.criterionId === '2.4.7')).toStrictEqual(
            true,
         );
      } finally {
         await rm(directory, { recursive: true, force: true });
      }
   });
});
