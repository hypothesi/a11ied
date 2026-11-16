import { resolve } from 'node:path';
import { withAuditAssessmentSnapshot, type AuditAssessmentSnapshot } from '@a11ied/core';
import type { ObservationBundle } from '@a11ied/contracts';
import {
   canonicalizeObservationURL,
   getObservationDigest,
   readCachedObservationBundle,
   validateObservationReceipt,
} from '@a11ied/observe';
import {
   CliUsageError,
   listExcludedSelectors,
   matchScopeExclusion,
} from '@a11ied/verdict';
import type { ReviewRunState, ReviewStateRecord } from './types.js';

export interface ReviewCoordinatorLink {
   file: string;
   runId: string;
}

export interface CoordinatedReviewScope {
   snapshot: AuditAssessmentSnapshot;
   roots: readonly { stateId: string; fingerprint: string; digest: string }[];
}

function rejectScope(reason: string): never {
   throw new CliUsageError('review-coordinator-scope-mismatch', reason);
}

async function readScopedRoot(
   run: ReviewRunState,
   state: ReviewStateRecord,
): Promise<ObservationBundle> {
   if (!state.fingerprint) {
      rejectScope(`State ${state.stateId} has no current collected observation.`);
   }
   const bundle = await readCachedObservationBundle(run.runDir, state.fingerprint);
   if (!bundle) {
      rejectScope(`State ${state.stateId} is missing its current observation.`);
   }
   await validateObservationReceipt({ cacheRoot: run.runDir, bundle });
   const exclusions = listExcludedSelectors({ state, exclusions: run.exclusions });
   if (
      bundle.stateId !== state.stateId ||
      bundle.targetUrl !== state.targetUrl ||
      JSON.stringify(bundle.setup) !== JSON.stringify(state.setup ?? []) ||
      JSON.stringify(bundle.excludedSelectors ?? []) !== JSON.stringify(exclusions)
   ) {
      rejectScope(
         `State ${state.stateId} has stale target, setup or exclusion evidence.`,
      );
   }
   return bundle;
}

function validateCoordinatorBindings(input: {
   run: ReviewRunState;
   link: ReviewCoordinatorLink;
   snapshot: AuditAssessmentSnapshot;
   bundles: readonly ObservationBundle[];
}): void {
   const coordinated = input.snapshot.status.run;
   if (
      coordinated.runId !== input.link.runId ||
      coordinated.target.kind !== 'url' ||
      new URL(coordinated.target.value).origin !== input.run.targetOrigin ||
      coordinated.profile.wcagVersion !== '2.2' ||
      coordinated.profile.level !== 'AA'
   ) {
      rejectScope(
         'The coordinator run, target origin or WCAG profile does not match this review.',
      );
   }
   if (coordinated.states.length !== input.bundles.length) {
      rejectScope(
         'The coordinator must reference exactly the current in-scope review states.',
      );
   }
   for (const bundle of input.bundles) {
      const state = coordinated.states.find((entry) => entry.stateId === bundle.stateId);
      const environment = coordinated.environments.find(
         (entry) => entry.environmentId === state?.environmentId,
      );
      if (
         !state ||
         state.target.kind !== 'url' ||
         state.fingerprint !== bundle.fingerprint ||
         state.observationDigest !== getObservationDigest(bundle) ||
         canonicalizeObservationURL(state.target.value) !==
            canonicalizeObservationURL(bundle.targetUrl) ||
         JSON.stringify(environment) !== JSON.stringify(bundle.environment)
      ) {
         rejectScope(
            `Coordinator state ${bundle.stateId} does not match its collected target, snapshot and environment.`,
         );
      }
   }
}

/**
 * Read actual coordinator validation results and bind their complete state set to current
 * roots.
 */
export async function withCoordinatedReviewScope<TResult>(
   input: { run: ReviewRunState; link: ReviewCoordinatorLink },
   consume: (scope: CoordinatedReviewScope) => Promise<TResult>,
): Promise<TResult> {
   return withAuditAssessmentSnapshot(
      resolve(input.run.runDir, input.link.file),
      async (snapshot) => {
         const states = input.run.states.filter(
            (state) =>
               !state.excluded && !matchScopeExclusion(state, input.run.exclusions),
         );
         const bundles = await Promise.all(
            states.map(async (state) => readScopedRoot(input.run, state)),
         );
         validateCoordinatorBindings({ ...input, snapshot, bundles });
         return consume({
            snapshot,
            roots: bundles.map((bundle) => ({
               stateId: bundle.stateId,
               fingerprint: bundle.fingerprint,
               digest: getObservationDigest(bundle),
            })),
         });
      },
   );
}

export async function readCoordinatedReviewScope(input: {
   run: ReviewRunState;
   link: ReviewCoordinatorLink;
}): Promise<CoordinatedReviewScope> {
   return withCoordinatedReviewScope(input, async (scope) => scope);
}
