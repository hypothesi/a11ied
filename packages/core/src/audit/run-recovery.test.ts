import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditRun } from '@a11ied/contracts';
import { getTestMethod } from '@a11ied/wcag-engine';
import { readAuditRun, updateAuditRun } from './run-store.js';
import {
   queueAssessmentCheck,
   registerAuditJourney,
   registerAuditState,
   transitionAssessmentCheck,
} from './run-state.js';
import {
   finalizeAuditAssessment,
   getAuditAssessmentStatus,
   nextAuditAssessment,
   resumeAuditAssessment,
} from './run-lifecycle.js';
import { listAssessmentObligations } from './run-obligations.js';
import {
   buildState,
   createObservedAuditRun,
   attachObservedAuditInventory,
   environment,
} from './test-fixtures.js';

const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function createObservedRun(
   input: Parameters<typeof createObservedAuditRun>[0] = {},
): Promise<{ file: string; run: AuditRun }> {
   const created = await createObservedAuditRun(input);
   roots.push(dirname(created.file));
   return created;
}

describe('live claims during state invalidation', () => {
   it('keeps the live claim until recovery when an observed state changes', async () => {
      const created = await createObservedRun();
      const work = await nextAuditAssessment(created.file);
      const state = created.run.states[0];
      if (!state || !work.check) {
         throw new Error('Missing claimed fixture scope.');
      }
      await registerAuditState({
         file: created.file,
         state: { ...state, fingerprint: 'changed' },
      });
      const changed = await readAuditRun(created.file);

      expect(changed.activeCheckId).toStrictEqual(work.check.checkId);
      await expect(nextAuditAssessment(created.file)).rejects.toThrow('already running');
      const resumed = await resumeAuditAssessment({ file: created.file });

      expect(resumed.run.activeCheckId).toBeUndefined();
      expect(
         resumed.run.checks.find((check) => check.checkId === work.check?.checkId)
            ?.status,
      ).toStrictEqual('blocked');
   });
});

describe('live claims during journey invalidation', () => {
   it('keeps the live claim when a journey changes its observed steps', async () => {
      const created = await createObservedRun();
      const stateIds = created.run.states.map((state) => state.stateId);
      await registerAuditJourney({
         file: created.file,
         journey: {
            journeyId: 'contact',
            label: 'Contact',
            stateIds,
            status: 'discovered',
         },
      });
      const procedure = getTestMethod('2.2.1', {
         version: '2.2',
      }).strategy.procedures.find((entry) => entry.scope === 'journey');
      if (!procedure) {
         throw new Error('Missing journey procedure.');
      }
      const queued = await queueAssessmentCheck({
         file: created.file,
         check: {
            criterionId: procedure.criterionId,
            procedureId: procedure.procedureId,
            procedureVersion: procedure.version,
            scope: procedure.scope,
            stateIds,
            journeyId: 'contact',
            environmentId: environment.environmentId,
         },
      });
      const checkId = queued.checks[0]?.checkId ?? '';
      await transitionAssessmentCheck({ file: created.file, checkId, status: 'running' });
      const observed = await registerAuditState({
         file: created.file,
         state: buildState('Dialog', 'dialog'),
      });
      await registerAuditJourney({
         file: created.file,
         journey: {
            journeyId: 'contact',
            label: 'Contact',
            stateIds: observed.states.map((state) => state.stateId),
            status: 'discovered',
         },
      });

      await expect(nextAuditAssessment(created.file)).rejects.toThrow('already running');
      const stored = await readAuditRun(created.file);

      expect(stored.activeCheckId).toStrictEqual(checkId);
   });
});

describe('normalized scope and redirect identity', () => {
   it.each(['https://createdbyfireside.com/', 'https://createdbyfireside.com/welcome/'])(
      'matches the supplied URL to its observed discovery alias: %s',
      async (observedUrl) => {
         const created = await createObservedRun({ observedUrl });
         await attachObservedAuditInventory(created);
         const status = await getAuditAssessmentStatus(created.file);

         expect(
            status.issues.some((issue) =>
               [
                  'audit-inventory-mismatch',
                  'audit-target-unobserved',
                  'audit-page-unobserved',
               ].includes(issue.code),
            ),
         ).toStrictEqual(false);
         expect(status.progress.pages[0]?.complete).toStrictEqual(false);
      },
   );
   it('rejects a redirect alias without matched discovery evidence', async () => {
      const created = await createObservedRun({
         observedUrl: 'https://createdbyfireside.com/welcome/',
      });
      const status = await getAuditAssessmentStatus(created.file);

      expect(
         status.issues.some((issue) => issue.code === 'audit-target-unobserved'),
      ).toStrictEqual(true);
   });
});

describe('partial discovery recovery', () => {
   it.each(['missing', 'corrupt'])(
      'preserves status and partial finalization with %s inventory',
      async (kind) => {
         const created = await createObservedRun();
         const inventoryPath = await attachObservedAuditInventory(created);
         await (kind === 'missing'
            ? rm(inventoryPath, { force: true })
            : writeFile(inventoryPath, '{incomplete'));
         const status = await getAuditAssessmentStatus(created.file);
         const partial = await finalizeAuditAssessment({
            file: created.file,
            allowPartial: true,
         });

         expect(
            status.issues.some((issue) => issue.code === 'audit-inventory-unavailable'),
         ).toStrictEqual(true);
         expect(partial.complete).toStrictEqual(false);
         expect(status.progress.states).toHaveLength(created.run.states.length);
      },
   );
});

describe('required obligation integrity', () => {
   it('rejects substituted check fields despite retaining an expected opaque identity', async () => {
      const created = await createObservedRun();
      const obligations = listAssessmentObligations(created.run);
      const first = obligations[0],
         second = obligations[1];
      if (!first || !second) {
         throw new Error('Missing catalog obligations.');
      }
      const before = await readAuditRun(created.file);

      await expect(
         updateAuditRun({
            file: created.file,
            change(run) {
               run.checks = [{ ...second, checkId: first.checkId }];
               return run;
            },
         }),
      ).rejects.toThrow('check identity');
      expect(await readAuditRun(created.file)).to.eql(before);
      const status = await getAuditAssessmentStatus(created.file);

      expect(
         status.issues.some(
            (issue) =>
               issue.code === 'audit-obligation-missing' &&
               issue.checkId === first.checkId,
         ),
      ).toStrictEqual(true);
      expect(status.complete).toStrictEqual(false);
   });
});

describe('saved identity and required catalog coverage', () => {
   it('rejects an externally substituted saved identity before reads, status, or claims', async () => {
      const created = await createObservedRun();
      const obligations = listAssessmentObligations(created.run);
      const first = obligations[0],
         second = obligations[1];
      if (!first || !second) {
         throw new Error('Missing catalog obligations.');
      }
      const altered = await readAuditRun(created.file);
      altered.checks = [{ ...second, checkId: first.checkId }];
      const body = JSON.stringify(altered);
      await writeFile(created.file, body);

      await expect(readAuditRun(created.file)).rejects.toThrow('check identity');
      await expect(getAuditAssessmentStatus(created.file)).rejects.toThrow(
         'check identity',
      );
      await expect(nextAuditAssessment(created.file)).rejects.toThrow('check identity');
      expect(await readFile(created.file, 'utf8')).toStrictEqual(body);
   });
   it('exposes uncovered criteria and derives journey progress from checks', async () => {
      const created = await createObservedRun({ level: 'AAA' });
      await registerAuditJourney({
         file: created.file,
         journey: {
            journeyId: 'contact',
            label: 'Contact',
            stateIds: created.run.states.map((state) => state.stateId),
            status: 'completed',
         },
      });
      const status = await getAuditAssessmentStatus(created.file);

      expect(
         status.issues.some((issue) => issue.code === 'audit-procedure-missing'),
      ).toStrictEqual(true);
      expect(status.progress.journeys[0]?.complete).toStrictEqual(false);
      expect(status.progress.journeys[0]?.assessed).toStrictEqual(0);
   });
});
