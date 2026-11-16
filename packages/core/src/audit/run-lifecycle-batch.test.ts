import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AuditRun } from '@a11ied/contracts';
import { createAuditRun, readAuditRun } from './run-store.js';
import { registerAuditState } from './run-state.js';
import { nextAuditAssessment, resumeAuditAssessment } from './run-lifecycle.js';
import { buildState, environment, target } from './test-fixtures.js';

const BATCH_COUNT = 5;
const MAX_BATCH = 20;
const roots: string[] = [];

afterEach(async () => {
   await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
   );
});

async function buildRun(): Promise<{ file: string; run: AuditRun }> {
   const root = await mkdtemp(resolve(tmpdir(), 'a11ied-batch-'));
   roots.push(root);
   const created = await createAuditRun({
      file: resolve(root, 'run.json'),
      target,
      environment: {
         ...environment,
         capabilities: ['rendered-ui', 'dom', 'keyboard', 'screenshot'],
      },
      profile: { wcagVersion: '2.2', level: 'AA' },
      scope: 'site',
   });
   const run = await registerAuditState({ file: created.file, state: buildState() });
   return { file: created.file, run };
}

describe('batch claims per state', () => {
   it('claims up to `count` checks sharing one state atomically', async () => {
      const { file } = await buildRun();
      const batch = await nextAuditAssessment(file, { count: BATCH_COUNT });
      const claimed = batch.checks ?? [];
      expect(claimed).toHaveLength(BATCH_COUNT);
      const run = await readAuditRun(file);
      expect(run.activeCheckIds).toStrictEqual(claimed.map((check) => check.checkId));
      const firstKey = JSON.stringify([...(claimed[0]?.stateIds ?? [])].toSorted());
      expect(
         claimed.every(
            (check) => JSON.stringify([...check.stateIds].toSorted()) === firstKey,
         ),
      ).toBe(true);
      await expect(nextAuditAssessment(file, { count: BATCH_COUNT })).rejects.toThrow(
         'already running',
      );
      const resumed = await resumeAuditAssessment({ file });
      expect(resumed.run.activeCheckIds).toStrictEqual([]);
      expect(
         claimed.every(
            (item) =>
               resumed.run.checks.find((check) => check.checkId === item.checkId)
                  ?.status === 'blocked',
         ),
      ).toBe(true);
   });

   it('does not batch checks from different states together', async () => {
      const { file } = await buildRun();
      await registerAuditState({
         file,
         state: {
            ...buildState(),
            stateId: 'second-page',
            target: { kind: 'url', value: 'https://example.test/second' },
         },
      });
      const batch = await nextAuditAssessment(file, { count: MAX_BATCH });
      const claimed = batch.checks ?? [];
      if (claimed.length === 0) {
         throw new Error('No obligation was claimed.');
      }
      const shared = new Set(claimed[0]?.stateIds);
      expect(claimed.every((check) => shared.has(check.stateIds[0] ?? ''))).toBe(true);
   });
});

describe('scope-filtered coordinator claims', () => {
   it('claims site work without consuming or blocking queued state procedures', async () => {
      const { file } = await buildRun();
      const batch = await nextAuditAssessment(file, {
         count: BATCH_COUNT,
         scopes: ['site'],
      });
      const claimed = batch.checks ?? [];
      const current = await readAuditRun(file);
      const stateChecks = current.checks.filter((check) => check.scope === 'state');

      expect(claimed.length).toBeGreaterThan(0);
      expect(claimed.every((check) => check.scope === 'site')).toStrictEqual(true);
      expect(stateChecks.length).toBeGreaterThan(0);
      expect(stateChecks.every((check) => check.status === 'queued')).toStrictEqual(true);
   });
});
