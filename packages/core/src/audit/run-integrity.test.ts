import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createAuditRun, readAuditRun, updateAuditRun } from './run-store.js';
import {
   queueAssessmentCheck,
   registerAuditJourney,
   registerAuditState,
} from './run-state.js';
import { migrateInventoryAuditRun } from './run-inventory.js';
import {
   buildElementCheck,
   buildJourney,
   buildState,
   environment,
   target,
} from './test-fixtures.js';
import { buildReportTestInventory } from '../report/test-fixtures.js';
import {
   readInventory,
   updateInventoryAtomic,
   writeInventoryAtomic,
} from '../discovery/inventory.js';

const TWO_CONTROLS = 2;
let directory = '',
   file = '';

beforeEach(async () => {
   directory = await mkdtemp(resolve(tmpdir(), 'a11ied-run-integrity-'));
   file = resolve(directory, 'run.json');
   await createAuditRun({
      file,
      target,
      profile: { wcagVersion: '2.2', level: 'AA' },
      scope: 'site',
      environment,
   });
});

afterEach(async () => {
   await rm(directory, { recursive: true, force: true });
});

describe('element and journey identities', () => {
   it('validates journey scope even when the obligation already exists', async () => {
      const observed = await registerAuditState({ file, state: buildState() }),
         state = observed.states[0];
      if (!state) {
         throw new Error('Missing state.');
      }
      const journey = buildJourney([state.stateId]);
      const check = {
         ...buildElementCheck(state.stateId, '#first'),
         criterionId: '2.2.1',
         procedureId: 'wcag_2_2_1',
         procedureVersion: '1',
         scope: 'journey' as const,
         journeyId: journey.journeyId,
      };
      await registerAuditJourney({ file, journey });
      await queueAssessmentCheck({ file, check });

      await expect(
         queueAssessmentCheck({
            file,
            check: { ...check, stateIds: ['unknown-state'] },
         }),
      ).rejects.toThrow('Unknown scope');
      await expect(
         queueAssessmentCheck({
            file,
            check: { ...check, stateIds: [] },
         }),
      ).rejects.toThrow('assessment scope');
      const current = await readAuditRun(file);

      expect(current.checks).toHaveLength(1);
      expect(current.checks[0]?.stateIds).to.eql([state.stateId]);
   });
});

describe('element coverage after journey changes', () => {
   it('keeps distinct controls separate and preserves obsolete journey checks as stale', async () => {
      const first = await registerAuditState({ file, state: buildState() }),
         state = first.states[0];
      if (!state) {
         throw new Error('Missing state.');
      }
      await registerAuditJourney({ file, journey: buildJourney([state.stateId]) });
      await queueAssessmentCheck({
         file,
         check: buildElementCheck(state.stateId, '#first'),
      });
      await queueAssessmentCheck({
         file,
         check: buildElementCheck(state.stateId, '#second'),
      });
      const second = await registerAuditState({
         file,
         state: buildState('Opened', 'opened'),
      });
      const next = second.states[1];
      if (!next) {
         throw new Error('Missing next state.');
      }
      await registerAuditJourney({ file, journey: buildJourney([next.stateId]) });
      const updated = await readAuditRun(file);

      expect(updated.checks).toHaveLength(TWO_CONTROLS);
      expect(updated.checks.every((item) => item.status === 'stale')).toStrictEqual(true);
      await expect(
         queueAssessmentCheck({
            file,
            check: buildElementCheck(state.stateId, '#unrelated'),
         }),
      ).rejects.toThrow('Unknown scope');
   });
});

describe('scope growth and safe run paths', () => {
   it('reopens a completed run when discovery adds a state or journey', async () => {
      await updateAuditRun({
         file,
         change(run) {
            return { ...run, status: 'complete' };
         },
      });
      const observed = await registerAuditState({ file, state: buildState() }),
         state = observed.states[0];
      if (!state) {
         throw new Error('Missing state.');
      }

      expect(observed.status).toStrictEqual('active');
      await updateAuditRun({
         file,
         change(run) {
            return { ...run, status: 'complete' };
         },
      });
      const journey = await registerAuditJourney({
         file,
         journey: {
            journeyId: 'new',
            label: 'New task',
            stateIds: [state.stateId],
            status: 'discovered',
         },
      });
      expect(journey.status).toStrictEqual('active');
      await expect(
         createAuditRun({
            target,
            profile: journey.profile,
            scope: 'site',
            environment,
            runId: '../outside',
         }),
      ).rejects.toThrow();
   });
});

describe('inventory migration consistency', () => {
   it('preserves concurrent inventory updates and linked metadata', async () => {
      const inventory = buildReportTestInventory(),
         inventoryPath = resolve(directory, 'legacy', 'inventory.json');
      await writeInventoryAtomic(inventory, inventoryPath);
      const [imported] = await Promise.all([
            migrateInventoryAuditRun({
               inventoryPath,
               profile: { wcagVersion: '2.2', level: 'AA' },
               environment,
            }),
            updateInventoryAtomic({
               path: inventoryPath,
               change(current) {
                  return {
                     ...current,
                     discovery: {
                        ...current.discovery,
                        pendingUrls: [`${target.value}contact-us/`],
                     },
                  };
               },
            }),
         ]),
         current = await readInventory(inventoryPath);

      expect(current.discovery.pendingUrls).to.eql([`${target.value}contact-us/`]);
      expect(current.run.assessmentFile).toStrictEqual(imported.file);
      await writeInventoryAtomic({ ...current, run: inventory.run }, inventoryPath);
      const refreshed = await readInventory(inventoryPath);
      expect(refreshed.run.profile).to.eql(imported.run.profile);
   });

   it('rejects an incompatible persisted profile before creating a run', async () => {
      const inventory = buildReportTestInventory(),
         inventoryPath = resolve(directory, 'legacy', 'inventory.json');
      inventory.run.profile = { wcagVersion: '2.1', level: 'AAA' };
      await writeInventoryAtomic(inventory, inventoryPath);

      await expect(
         migrateInventoryAuditRun({
            inventoryPath,
            profile: { wcagVersion: '2.2', level: 'AA' },
            environment,
         }),
      ).rejects.toThrow('different WCAG profile');
   });
});
