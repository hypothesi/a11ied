import { appendFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CriterionId, ObservationBundle } from '@a11ied/contracts';
import {
   type StartReviewResult,
   judge,
   next,
   readReviewRunState,
   report,
   resume,
   status,
   writeReviewRunState,
} from '@a11ied/review';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { getVerdictStorePath } from '@a11ied/verdict';
import { runCli } from '../../../cli/src/testing/setup.js';
import { withHarness } from '../../../mcp-server/src/testing/harness.js';
import {
   createMockBundle,
   createPassedJudgment,
   startFixture,
} from './review-test-fixtures.js';

const SHORT_LEASE_MS = 60_000;
let directory = '';

beforeEach(async () => {
   directory = await mkdtemp(join(tmpdir(), 'a11ied-continuation-'));
});

afterEach(async () => {
   await rm(directory, { recursive: true, force: true });
});

async function startRun(
   stateIds = ['first'],
   criterionIds: CriterionId[] = ['1.3.2'],
): Promise<{ started: StartReviewResult; bundles: ObservationBundle[] }> {
   const bundles = stateIds.map((stateId) =>
      createMockBundle({
         stateId,
         fingerprint: `snapshot-${stateId}`,
         targetUrl: `https://example.com/${stateId}`,
      }),
   );
   const started = await startFixture({
      runDir: directory,
      criterionIds,
      states: bundles.map((bundle) => ({
         stateId: bundle.stateId,
         targetUrl: bundle.targetUrl,
         bundle,
      })),
   });
   return { started, bundles };
}

describe('Continuation scheduling', () => {
   it('keeps another state runnable when one assessment has a local blocker', async () => {
      await startRun(['first', 'second']);
      await next({ runDir: directory, agentId: 'worker' });
      await judge({
         runDir: directory,
         agentId: 'worker',
         verdicts: [
            {
               stateId: 'first',
               criterionId: '1.3.2',
               outcome: 'cantTell',
               blockerCode: 'capability-unsupported',
               rationale: 'Fixture observation is unavailable on this state.',
            },
         ],
      });
      const progress = await status({ runDir: directory, agentId: 'replacement' });
      const batch = await next({ runDir: directory, agentId: 'replacement' });

      expect(progress.execution.state).toStrictEqual('runnable');
      expect(progress.coverage.cantTell).toStrictEqual(1);
      expect(progress.execution.reasons.join(' ')).toContain(
         'first:1.3.2: Fixture observation',
      );
      expect(batch.packet?.stateId).toStrictEqual('second');
      expect(batch.done).toStrictEqual(false);
   });

   it('reports live ownership as waiting and never steals a nonexpired claim', async () => {
      const { started } = await startRun();
      const owned = await next({ runDir: directory, agentId: 'owner' });
      const progress = await resume({
         runDir: directory,
         runId: started.runId,
         agentId: 'other',
      });
      const unavailable = await next({ runDir: directory, agentId: 'other' });

      expect(progress.execution.state).toStrictEqual('waiting');
      expect(progress.execution.waitUntil).toStrictEqual(owned.packet?.lease.expiresAt);
      expect(progress.activeLeases[0]?.agentId).toStrictEqual('owner');
      expect(progress.actionable[0]?.kind).toStrictEqual('leased');
      expect(unavailable.done).toStrictEqual(false);
      expect(unavailable.reason).toStrictEqual('leased');
   });

   it('renews a progressing partial batch and records the time of accepted progress', async () => {
      const { bundles } = await startRun(['first'], ['1.3.2', '3.1.2']);
      const batch = await next({ runDir: directory, agentId: 'owner' });
      const run = await readReviewRunState(directory);
      const bundle = bundles[0],
         check = batch.packet?.checks.find((entry) => entry.criterionId === '1.3.2'),
         lease = run.activeStateLeases.first;
      if (!bundle || !check || !lease) {
         throw new Error('Missing partial batch fixture.');
      }
      const previousExpiry = new Date(Date.now() + SHORT_LEASE_MS).toISOString();
      lease.expiresAt = previousExpiry;
      await writeReviewRunState(directory, run);
      await judge({
         runDir: directory,
         agentId: 'owner',
         verdicts: [createPassedJudgment(check, bundle)],
      });
      const saved = await readReviewRunState(directory);
      const remaining = saved.activeStateLeases.first;

      expect(remaining?.claimedCheckIds).toHaveLength(1);
      expect(remaining?.lastProgressAt).toBeDefined();
      expect(Date.parse(remaining?.expiresAt ?? '')).toBeGreaterThan(
         Date.parse(previousExpiry),
      );
      expect(remaining?.claimedAt).toStrictEqual(lease.claimedAt);
   });

   it('keeps a completed batch incomplete while an explicit scope gap remains', async () => {
      const { bundles } = await startRun();
      const batch = await next({ runDir: directory });
      const bundle = bundles[0],
         check = batch.packet?.checks[0];
      if (!bundle || !check) {
         throw new Error('Missing scope fixture.');
      }
      await judge({ runDir: directory, verdicts: [createPassedJudgment(check, bundle)] });
      const run = await readReviewRunState(directory);
      run.scopeGaps = ['Protected checkout has not been inspected.'];
      await writeReviewRunState(directory, run);
      const progress = await status({ runDir: directory });
      const idle = await next({ runDir: directory });

      expect(progress.coverage.unresolved).toStrictEqual(0);
      expect(progress.execution.state).toStrictEqual('blocked');
      expect(progress.execution.reasons).toContain(
         'Protected checkout has not been inspected.',
      );
      expect(idle.done).toStrictEqual(false);
      await expect(report({ runDir: directory, draft: false })).rejects.toThrow(
         'Final report refused',
      );
   });

   it('does not call an entirely excluded scope a completed review', async () => {
      await startFixture({
         runDir: directory,
         criterionIds: ['1.3.2'],
         states: [
            {
               stateId: 'excluded',
               targetUrl: 'https://example.com/',
               excluded: true,
               exclusionReason: 'Outside the requested scope.',
            },
         ],
      });
      const progress = await status({ runDir: directory });
      const idle = await next({ runDir: directory });

      expect(progress.execution.state).toStrictEqual('blocked');
      expect(idle.done).toStrictEqual(false);
   });
});

const publicResumeSchema = z.object({
   coverage: z.object({ passed: z.number(), unresolved: z.number() }),
   execution: z.object({ state: z.string() }),
   activeLeases: z.array(z.unknown()),
});
const publicNextSchema = z.object({
   done: z.boolean(),
   packet: z.object({ stateId: z.string() }),
});

describe('Cold public continuation', () => {
   it('recovers expiration in a new CLI process without replaying accepted work or requiring a coordinator', async () => {
      const { bundles, started } = await startRun(['first', 'second']);
      const first = await next({ runDir: directory, agentId: 'original' });
      const bundle = bundles[0],
         check = first.packet?.checks[0];
      if (!bundle || !check) {
         throw new Error('Missing cold resume fixture.');
      }
      await judge({
         runDir: directory,
         agentId: 'original',
         verdicts: [createPassedJudgment(check, bundle)],
      });
      await next({ runDir: directory, agentId: 'interrupted' });
      const run = await readReviewRunState(directory);
      const expired = run.activeStateLeases.second;
      if (!expired) {
         throw new Error('Missing interrupted lease.');
      }
      expired.expiresAt = '2000-01-01T00:00:00.000Z';
      await writeReviewRunState(directory, run);
      await appendFile(getVerdictStorePath(directory), '{"stateId":', 'utf8');
      const cold = await runCli([
         'review',
         'resume',
         '--run-dir',
         directory,
         '--run-id',
         started.runId,
         '--agent',
         'replacement',
         '--json',
      ]);
      const recovered = publicResumeSchema.parse(JSON.parse(cold.stdout));
      const files = await readdir(directory);

      expect(cold.status, cold.stdout).toStrictEqual(0);
      expect(
         files.some((file) => file.startsWith('verdicts-interrupted-')),
      ).toStrictEqual(true);
      expect(recovered.coverage).to.eql({ passed: 1, unresolved: 1 });
      expect(recovered.execution.state).toStrictEqual('runnable');
      expect(recovered.activeLeases).to.eql([]);
      await withHarness(async ({ client }) => {
         const result = await client.callTool({
            name: 'review.resume',
            arguments: {
               runDir: directory,
               runId: started.runId,
               agentId: 'replacement',
            },
         });

         expect(result.isError).toBeFalsy();
         expect(result.structuredContent).toMatchObject({
            execution: { state: 'runnable' },
            coverage: { passed: 1 },
         });
      });
      const nextProcess = await runCli([
         'review',
         'next',
         '--run-dir',
         directory,
         '--agent',
         'replacement',
         '--json',
      ]);
      const pending = publicNextSchema.parse(JSON.parse(nextProcess.stdout));

      expect(nextProcess.status, nextProcess.stdout).toStrictEqual(0);
      expect(pending.packet.stateId).toStrictEqual('second');
      expect(pending.done).toStrictEqual(false);
   });
});
