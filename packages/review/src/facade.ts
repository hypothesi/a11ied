/* oxlint-disable max-lines, max-lines-per-function, max-statements, complexity/complexity, no-magic-numbers, unicorn/no-null, init-declarations */
import { createHash, randomUUID } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
   verdictSchema,
   verdictProposalSchema,
   type CriterionId,
   type ObservationBundle,
   type Verdict,
} from '@a11ied/contracts';
import {
   CliUsageError,
   compareClaimableWork,
   computePageVerdicts,
   computeVerdictId,
   createExclusionVerdict,
   getCriterionImpact,
   getReviewCheckID,
   listReviewObligations,
   type ReviewObligation,
   matchScopeExclusion,
   listExcludedSelectors,
   readReviewVerdicts,
   readVerdicts,
   admitReviewVerdict,
   recordBundleVerdicts,
   recordVerdict,
   resolveEvidenceProcedure,
   scoreObservationBundle,
} from '@a11ied/verdict';
import {
   DEFAULT_OBSERVATION_CONCURRENCY,
   observeState,
   captureCondition,
   getObservationDigest,
   observeTargetsInParallel,
   readCachedObservationBundle,
   withDirectoryCommit,
   appendLine,
   withPathLock,
   writeAtomic,
   writeCachedObservationBundle,
} from '@a11ied/observe';
import {
   buildVerdictAuditReport,
   DEFAULT_WCAG_22_AA_CRITERIA,
   writeVerdictAuditReportFiles,
} from '@a11ied/report';
import type {
   ActionableReviewItem,
   JudgeReviewInput,
   JudgeReviewResult,
   JudgeVerdictInput,
   NeedsReviewItem,
   NextReviewInput,
   NextReviewResult,
   ObserveReviewInput,
   ObserveReviewResult,
   ObservationBundleSliceName,
   ReportReviewInput,
   ReportReviewResult,
   ReviewCheckItem,
   ReviewCoverageSummary,
   ReviewRunState,
   ReviewStateRecord,
   ReviewTargetStateInput,
   RunReviewInput,
   RunReviewResult,
   StartReviewInput,
   StartReviewResult,
   StateClaimLease,
   StateReviewPacket,
   StatusReviewInput,
   StatusReviewResult,
} from './types.js';

import {
   readCoordinatedReviewScope,
   withCoordinatedReviewScope,
   type ReviewCoordinatorLink,
} from './coordinator-scope.js';
import {
   listBroaderReviewObligations,
   listStateReviewCriteria,
} from './coordinated-progress.js';
import { composeCoordinatedReviewReport } from './coordinated-report.js';

import { getReviewExecutionState } from './execution.js';

const DEFAULT_BATCH_COUNT = 10;
const LEASE_DURATION_MS = 15 * 60 * 1000;
const MAX_ACTIONABLE_STATUS_ITEMS = 20;
const TIER_ZERO = 0;
const TIER_TWO = 2;
const DEFAULT_CONFIDENCE = 0.9;
const UUID_PREFIX_LENGTH = 12;

export function getReviewRunPath(runDir: string): string {
   return join(resolve(runDir), 'review-run.json');
}

export async function readReviewRunState(runDir: string): Promise<ReviewRunState> {
   const filePath = getReviewRunPath(runDir);
   try {
      const content = await readFile(filePath, 'utf8');
      return JSON.parse(content) as ReviewRunState;
   } catch (error) {
      throw new CliUsageError(
         'review-run-not-found',
         `Failed to read review run from ${filePath}. Run review.start first.`,
         { runDir, cause: error },
      );
   }
}

export async function writeReviewRunState(
   runDir: string,
   state: ReviewRunState,
): Promise<void> {
   await writeAtomic(getReviewRunPath(runDir), state);
}

function deriveTargetOrigin(input: StartReviewInput, defaultUrl: string): string {
   if (input.targetOrigin) {
      return input.targetOrigin;
   }
   if (typeof input.target === 'object' && input.target?.origin) {
      return input.target.origin;
   }
   try {
      return new URL(defaultUrl).origin;
   } catch {
      return 'https://target.local';
   }
}

function computeCoverage({
   states,
   verdicts,
   criterionIds,
   broader = [],
}: {
   states: readonly ReviewStateRecord[];
   verdicts: readonly Verdict[];
   criterionIds: readonly CriterionId[];
   broader?: readonly { complete: boolean; outcome: string }[];
}): ReviewCoverageSummary {
   const obligations = [
      ...listReviewObligations({ states, verdicts, criterionIds }),
      ...broader.map((unit) => ({ ...unit, blocked: unit.outcome === 'cantTell' })),
   ];
   const totalObligations = obligations.length;
   let passed = 0;
   let failed = 0;
   let inapplicable = 0;
   let cantTell = 0;
   let needsReview = 0;
   let excluded = 0;

   for (const obligation of obligations) {
      if (obligation.blocked && !obligation.complete) {
         cantTell += 1;
         continue;
      }
      if (!obligation.complete) {
         needsReview += 1;
         continue;
      }
      switch (obligation.outcome) {
         case 'passed': {
            passed += 1;
            break;
         }
         case 'failed': {
            failed += 1;
            break;
         }
         case 'inapplicable': {
            inapplicable += 1;
            break;
         }
         case 'cantTell': {
            cantTell += 1;
            break;
         }
         case 'needsReview': {
            needsReview += 1;
            break;
         }
         case 'excluded': {
            excluded += 1;
            break;
         }
         default: {
            break;
         }
      }
   }

   const assessed = passed + failed + inapplicable;
   const inScope = totalObligations - excluded;
   const resolved = assessed + excluded;
   const unresolved = Math.max(0, totalObligations - resolved);
   const percentComplete = inScope > 0 ? Math.floor((assessed / inScope) * 100) : 100;

   return {
      totalObligations,
      passed,
      failed,
      inapplicable,
      cantTell,
      needsReview,
      excluded,
      unresolved,
      percentComplete,
   };
}

function getDecisionMap(
   runState: Pick<ReviewRunState, 'states' | 'criterionIds' | 'coordinator'>,
   verdicts: readonly Verdict[],
): Map<string, ReviewObligation> {
   return new Map(
      listReviewObligations({ ...runState, verdicts }).map((obligation) => [
         obligation.checkID,
         obligation,
      ]),
   );
}

function listBlockedReviewReasons(
   decidedMap: ReadonlyMap<string, ReviewObligation>,
   verdicts: readonly Verdict[],
): string[] {
   return [...decidedMap.values()]
      .filter((unit) => unit.blocked)
      .slice(0, MAX_ACTIONABLE_STATUS_ITEMS)
      .map((unit) => {
         const verdict = verdicts.findLast(
            (record) =>
               record.stateId === unit.stateId &&
               record.criterionId === unit.criterionId &&
               record.outcome === 'cantTell',
         );
         return `${unit.checkID}: ${verdict?.rationale ?? 'A recorded blocker remains unresolved.'}`;
      });
}

function findOpenChecksForState({
   state,
   criterionIds,
   decidedCheckMap,
   retryBlocked = false,
}: {
   state: ReviewStateRecord;
   criterionIds: readonly CriterionId[];
   decidedCheckMap: ReadonlyMap<string, ReviewObligation>;
   retryBlocked?: boolean;
}): ReviewCheckItem[] {
   if (state.excluded) {
      return [];
   }

   const items: ReviewCheckItem[] = [];
   for (const criterionId of criterionIds) {
      const checkKey = getReviewCheckID(state.stateId, criterionId);
      const existing = decidedCheckMap.get(checkKey);
      if (existing?.complete || (existing?.blocked && !retryBlocked)) {
         continue;
      }

      let procedure;
      try {
         procedure = resolveEvidenceProcedure({ criterionId });
      } catch {
         continue;
      }

      const doneDef = procedure.done ?? {
         passed: 'All required conditions satisfied.',
         failed: 'One or more required conditions failed.',
         inapplicable: 'Target element or condition is absent.',
         cantTell: 'Blocked by an explicit blocker code.',
      };

      items.push({
         checkId: checkKey,
         stateId: state.stateId,
         criterionId,
         title: `Assess WCAG ${criterionId}`,
         impact: getCriterionImpact(criterionId),
         tier: TIER_TWO,
         procedureId: procedure.procedureId,
         procedureTitle: procedure.title,
         procedureVersion: procedure.version,
         actions: procedure.actions,
         requiredCapabilities: procedure.requiredCapabilities,
         requiredEvidence: procedure.requiredEvidence,
         toolCalls: procedure.toolCalls ?? [],
         done: doneDef,
         inapplicabilityKind: doneDef.inapplicabilityKind,
         allowedBlockerCodes: doneDef.allowedBlockerCodes,
      });
   }

   return items.toSorted((left, right) =>
      compareClaimableWork(
         {
            id: left.checkId,
            stateId: left.stateId,
            criterionId: left.criterionId,
            impact: left.impact,
         },
         {
            id: right.checkId,
            stateId: right.stateId,
            criterionId: right.criterionId,
            impact: right.impact,
         },
      ),
   );
}

function extractNeedsReviewItems(
   bundle: ObservationBundle | undefined,
   checks: readonly ReviewCheckItem[],
): NeedsReviewItem[] {
   if (!bundle) {
      return [];
   }
   const items: NeedsReviewItem[] = [];

   for (const check of checks) {
      items.push({
         checkId: check.checkId,
         criterionId: check.criterionId,
         stateId: check.stateId,
         kind: 'needs-review',
         summary: `Inspect elements for WCAG ${check.criterionId}`,
         screenshotPath: bundle.screenshots?.fullPagePath,
      });
   }

   return items;
}

async function assertNewRunDirectory(runDir: string): Promise<void> {
   try {
      await access(getReviewRunPath(runDir));
   } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
         return;
      }
      throw error;
   }
   throw new CliUsageError(
      'review-run-exists',
      'This run already exists. Resume with next/observe or choose a new run directory.',
   );
}

function getTargetStates(input: StartReviewInput): readonly ReviewTargetStateInput[] {
   if (input.states?.length) {
      return input.states;
   }
   if (!input.target) {
      throw new CliUsageError(
         'target-required',
         'Provide a target URL or registered states.',
      );
   }
   return [
      {
         stateId: 'initial',
         targetUrl: typeof input.target === 'string' ? input.target : input.target.url,
      },
   ];
}

export async function start(input: StartReviewInput): Promise<StartReviewResult> {
   const runDir = resolve(input.runDir);
   await assertNewRunDirectory(runDir);
   const runId = input.runId ?? `review-${randomUUID().slice(0, UUID_PREFIX_LENGTH)}`;
   const criterionIds = [...new Set(input.criterionIds ?? DEFAULT_WCAG_22_AA_CRITERIA)];
   const exclusions = input.exclusions ?? [];

   const rawStates = getTargetStates(input);

   if (new Set(rawStates.map((state) => state.stateId)).size !== rawStates.length) {
      throw new CliUsageError(
         'duplicate-state-id',
         'Registered review states require unique IDs.',
      );
   }
   const defaultUrl = rawStates[0]?.targetUrl ?? 'https://example.com';
   const targetOrigin = deriveTargetOrigin(input, defaultUrl);

   const registeredStates: ReviewStateRecord[] = [];
   const bundlesToScore: { state: ReviewStateRecord; bundle: ObservationBundle }[] = [];

   for (const rawState of rawStates) {
      const exclusionMatch = matchScopeExclusion(
         { stateId: rawState.stateId, targetUrl: rawState.targetUrl },
         exclusions,
      );

      const isExcluded = rawState.excluded === true || exclusionMatch !== undefined;
      const exclusionReason = rawState.exclusionReason ?? exclusionMatch?.reason;
      if (isExcluded && !exclusionReason) {
         throw new CliUsageError(
            'exclusion-reason-required',
            'Excluded states require a recorded reason or matching scope policy.',
         );
      }

      const stateRecord: ReviewStateRecord = {
         stateId: rawState.stateId,
         targetUrl: rawState.targetUrl,
         templateGroup: rawState.templateGroup,
         setup: rawState.setup,
         excluded: isExcluded,
         exclusionReason,
         fingerprint: rawState.bundle?.fingerprint,
      };

      if (rawState.bundle) {
         // oxlint-disable-next-line no-await-in-loop -- sequential bundle registration
         await writeCachedObservationBundle(runDir, rawState.bundle);
         stateRecord.fingerprint = rawState.bundle.fingerprint;
         bundlesToScore.push({ state: stateRecord, bundle: rawState.bundle });
      }

      registeredStates.push(stateRecord);
   }

   // Observe each state because shared templates can contain different content.
   const statesNeedingObserve = registeredStates.filter(
      (state) => !state.excluded && !state.fingerprint,
   );

   if (statesNeedingObserve.length > 0) {
      if (input.observeTarget) {
         const observedBundles = await observeTargetsInParallel(
            statesNeedingObserve.map((stateItem) => ({
               targetUrl: stateItem.targetUrl,
               stateId: stateItem.stateId,
               ...(stateItem.setup ? { setup: stateItem.setup } : {}),
            })),
            {
               concurrency: input.concurrency ?? DEFAULT_OBSERVATION_CONCURRENCY,
               observeTarget: input.observeTarget,
            },
         );

         for (let index = 0; index < statesNeedingObserve.length; index += 1) {
            const stateItem = statesNeedingObserve[index];
            const observedBundle = observedBundles[index];
            if (stateItem && observedBundle) {
               // oxlint-disable-next-line no-await-in-loop -- sequential bundle registration
               await writeCachedObservationBundle(runDir, observedBundle);
               stateItem.fingerprint = observedBundle.fingerprint;
               bundlesToScore.push({ state: stateItem, bundle: observedBundle });
            }
         }
      } else if (input.browser) {
         const browserRef = input.browser;
         const observedBundles = await observeTargetsInParallel(
            statesNeedingObserve.map((stateItem) => ({
               targetUrl: stateItem.targetUrl,
               stateId: stateItem.stateId,
               ...(stateItem.setup ? { setup: stateItem.setup } : {}),
            })),
            {
               concurrency: input.concurrency ?? DEFAULT_OBSERVATION_CONCURRENCY,
               observeTarget: async (target) => {
                  const { bundle } = await observeState({
                     browser: browserRef,
                     excludedSelectors: listExcludedSelectors({
                        state: target,
                        exclusions,
                     }),
                     targetUrl: target.targetUrl,
                     stateId: target.stateId,
                     ...(target.setup ? { setup: target.setup } : {}),
                     cacheRoot: runDir,
                  });
                  return bundle;
               },
            },
         );
         for (let index = 0; index < statesNeedingObserve.length; index += 1) {
            const stateItem = statesNeedingObserve[index];
            const bundle = observedBundles[index];
            if (stateItem && bundle) {
               stateItem.fingerprint = bundle.fingerprint;
               bundlesToScore.push({ state: stateItem, bundle });
            }
         }
      }
   }

   // Auto-verdicts scoring (Tier 0 & Tier 1 & Scope Exclusions)
   const initialVerdicts: Verdict[] = [];

   // Record exclusions
   for (const stateItem of registeredStates) {
      if (stateItem.excluded) {
         for (const criterionId of criterionIds) {
            initialVerdicts.push(
               createExclusionVerdict({
                  stateId: stateItem.stateId,
                  criterionId,
                  rule: {
                     ruleId: 'scope-exclusion',
                     reason: stateItem.exclusionReason ?? 'Excluded from audit scope',
                  },
               }),
            );
         }
      }
   }

   // Score observation bundles
   for (const { state: stateItem, bundle: observedBundle } of bundlesToScore) {
      if (stateItem.excluded) {
         continue;
      }
      const scoredVerdicts = scoreObservationBundle(observedBundle, {
         criterionIds,
         exclusions,
      });

      for (const verdict of scoredVerdicts) {
         if (
            verdict.tier === TIER_ZERO ||
            verdict.outcome === 'passed' ||
            verdict.outcome === 'failed' ||
            verdict.outcome === 'inapplicable' ||
            verdict.outcome === 'excluded'
         ) {
            initialVerdicts.push(verdict);
         }
      }
   }

   if (initialVerdicts.length > 0) {
      await recordBundleVerdicts(runDir, initialVerdicts);
   }

   const runState: ReviewRunState = {
      scopeGaps: input.scopeGaps,
      runId,
      runDir,
      targetOrigin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      criterionIds,
      exclusions,
      states: registeredStates,
      activeStateLeases: {},
   };

   await writeReviewRunState(runDir, runState);

   const recordedVerdicts = await readReviewVerdicts(runDir, runState);
   const decidedMap = getDecisionMap(
      { states: registeredStates, criterionIds },
      recordedVerdicts,
   );

   const allOpenChecks = registeredStates.flatMap((stateItem) =>
      findOpenChecksForState({
         state: stateItem,
         criterionIds,
         decidedCheckMap: decidedMap,
      }),
   );

   const coverage = computeCoverage({
      states: registeredStates,
      verdicts: recordedVerdicts,
      criterionIds,
   });
   const pageVerdicts = computePageVerdicts(
      registeredStates,
      recordedVerdicts,
      criterionIds,
   );

   return {
      runId,
      targetOrigin,
      statesCount: registeredStates.length,
      verdictsRecorded: recordedVerdicts.length,
      openTier2Count: allOpenChecks.length,
      coverage,
      pageVerdicts,
      nextBatchPreview: allOpenChecks.slice(0, DEFAULT_BATCH_COUNT),
   };
}

function buildCurrentReviewReport({
   runState,
   verdicts,
   coordinatedScope,
   forceDraft = false,
}: {
   runState: ReviewRunState;
   verdicts: readonly Verdict[];
   coordinatedScope?: Awaited<ReturnType<typeof readCoordinatedReviewScope>> | undefined;
   forceDraft?: boolean;
}): ReturnType<typeof buildVerdictAuditReport> {
   const stateReport = buildVerdictAuditReport({
      targetOrigin: runState.targetOrigin,
      states: runState.states,
      verdicts,
      criterionIds: runState.coordinator
         ? listStateReviewCriteria(runState)
         : runState.criterionIds,
      exclusions: runState.exclusions,
      forceDraft,
      scopeGaps: runState.scopeGaps,
   });
   return coordinatedScope
      ? composeCoordinatedReviewReport({
           run: runState,
           scope: coordinatedScope,
           stateReport,
           forceDraft,
        })
      : stateReport;
}

function isLeaseExpired(lease: StateClaimLease): boolean {
   const expiresAt = lease.expiresAt ? Date.parse(lease.expiresAt) : Number.NaN;
   return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
}

function getActiveStateLeases(
   leases: ReviewRunState['activeStateLeases'],
): ReviewRunState['activeStateLeases'] {
   return Object.fromEntries(
      Object.entries(leases).filter(([, lease]) => !isLeaseExpired(lease)),
   );
}

export async function next(input: NextReviewInput): Promise<NextReviewResult> {
   const runDir = resolve(input.runDir);
   const lockPath = getReviewRunPath(runDir);

   return withPathLock(lockPath, async () => {
      const runState = await readReviewRunState(runDir);
      const verdicts = await readReviewVerdicts(runDir, runState);
      const stateCriteria = runState.coordinator
         ? listStateReviewCriteria(runState)
         : runState.criterionIds;
      const decidedMap = getDecisionMap(
         { ...runState, criterionIds: stateCriteria },
         verdicts,
      );
      const coordinatedScope = runState.coordinator
         ? await readCoordinatedReviewScope({ run: runState, link: runState.coordinator })
         : undefined;
      const broaderObligations = coordinatedScope
         ? listBroaderReviewObligations({ run: runState, scope: coordinatedScope })
         : [];

      const activeLeases = getActiveStateLeases(runState.activeStateLeases);
      if (
         Object.keys(activeLeases).length !==
         Object.keys(runState.activeStateLeases).length
      ) {
         runState.activeStateLeases = activeLeases;
         await writeReviewRunState(runDir, runState);
      }

      const agentId = input.agentId ?? 'default-agent';
      const requestedStateId = input.stateId;

      let chosenState: ReviewStateRecord | undefined;
      let chosenOpenChecks: ReviewCheckItem[] = [];

      if (requestedStateId) {
         const stateItem = runState.states.find(
            (item) => item.stateId === requestedStateId,
         );
         if (!stateItem) {
            throw new CliUsageError(
               'state-not-found',
               `State ${requestedStateId} not found in review run.`,
            );
         }
         const existingLease = runState.activeStateLeases[requestedStateId];
         if (existingLease && existingLease.agentId !== agentId) {
            throw new CliUsageError(
               'state-already-leased',
               `[state-already-leased] State ${requestedStateId} is currently leased to agent ${existingLease.agentId}.`,
               { stateId: requestedStateId, agentId: existingLease.agentId },
            );
         }
         const openChecks = findOpenChecksForState({
            state: stateItem,
            criterionIds: stateCriteria,
            decidedCheckMap: decidedMap,
            retryBlocked: true,
         });
         chosenState = stateItem;
         chosenOpenChecks = openChecks;
      } else {
         for (const stateItem of runState.states) {
            if (stateItem.excluded) {
               continue;
            }
            const existingLease = runState.activeStateLeases[stateItem.stateId];
            // Leased to another agent, keep looking for disjoint parallel state
            if (existingLease && existingLease.agentId !== agentId) {
               continue;
            }
            const openChecks = findOpenChecksForState({
               state: stateItem,
               criterionIds: stateCriteria,
               decidedCheckMap: decidedMap,
            });
            if (openChecks.length > 0) {
               chosenState = stateItem;
               chosenOpenChecks = openChecks;
               break;
            }
         }
      }

      if (!chosenState || chosenOpenChecks.length === 0) {
         const coverage = computeCoverage({
            states: runState.states,
            verdicts,
            criterionIds: stateCriteria,
            broader: broaderObligations,
         });
         const finalReady =
            coverage.unresolved === 0 &&
            !buildCurrentReviewReport({ runState, verdicts, coordinatedScope }).isDraft;
         const stateWorkAvailable = runState.states.some((state) => {
            const lease = activeLeases[state.stateId];
            if (lease && lease.agentId !== agentId) {
               return false;
            }
            return (
               findOpenChecksForState({
                  state,
                  criterionIds: stateCriteria,
                  decidedCheckMap: decidedMap,
               }).length > 0
            );
         });
         const execution = getReviewExecutionState({
            runDir,
            agentId,
            coverage,
            finalReady,
            stateWorkAvailable,
            activeLeases: Object.values(activeLeases),
            scopeGaps: runState.scopeGaps ?? [],
            blockers: listBlockedReviewReasons(decidedMap, verdicts),
            broader: broaderObligations,
            coordinator: runState.coordinator,
            scope: coordinatedScope,
         });
         let reason: NextReviewResult['reason'] = 'blocked';
         if (execution.state === 'complete') {
            reason = 'complete';
         } else if (execution.state === 'waiting') {
            reason = 'leased';
         } else if (execution.nextAction && 'kind' in execution.nextAction) {
            reason = 'scope-required';
         } else if (execution.nextAction?.tool === 'audit_assessment') {
            reason = 'coordinator-work';
         } else if (execution.state === 'runnable') {
            reason = 'no-claimable-work';
         }
         const coordinatorNextAction =
            execution.nextAction &&
            'tool' in execution.nextAction &&
            execution.nextAction.tool === 'audit_assessment'
               ? execution.nextAction
               : undefined;
         return {
            done: execution.state === 'complete',
            reason,
            packet: null,
            execution,
            ...(coordinatorNextAction ? { coordinatorNextAction } : {}),
         };
      }

      const batchCount = Math.min(
         input.count ?? DEFAULT_BATCH_COUNT,
         chosenOpenChecks.length,
      );
      const claimedChecks = chosenOpenChecks.slice(0, batchCount);

      const lease: StateClaimLease = {
         stateId: chosenState.stateId,
         agentId,
         claimedCheckIds: claimedChecks.map((item) => item.checkId),
         claimedAt: new Date().toISOString(),
         expiresAt: new Date(Date.now() + LEASE_DURATION_MS).toISOString(),
      };

      runState.activeStateLeases[chosenState.stateId] = lease;
      runState.updatedAt = new Date().toISOString();
      await writeReviewRunState(runDir, runState);

      let bundle: ObservationBundle | undefined;
      if (chosenState.fingerprint) {
         bundle = await readCachedObservationBundle(runDir, chosenState.fingerprint);
      }

      const bundleFacts = bundle?.facts as Record<string, unknown> | undefined;
      const landmarks = bundleFacts?.landmarks as Record<string, unknown> | undefined;
      const headings = Array.isArray(bundleFacts?.headings) ? bundleFacts.headings : [];

      const packet: StateReviewPacket = {
         runId: runState.runId,
         stateId: chosenState.stateId,
         targetUrl: chosenState.targetUrl,
         lease,
         bundleSummary: {
            digest: bundle ? getObservationDigest(bundle) : undefined,
            fingerprint: bundle?.fingerprint ?? 'none',
            capturedAt: bundle?.capturedAt ?? new Date().toISOString(),
            title: typeof bundleFacts?.title === 'string' ? bundleFacts.title : undefined,
            interactiveElementCount: bundle?.interactiveCandidates?.length ?? 0,
            headingCount: headings.length,
            landmarkCount: landmarks ? Object.keys(landmarks).length : 0,
         },
         virtualSrTranscript: bundle?.transcript ?? {
            provenance: 'virtual-dom',
            spokenOrder: [],
            headings: [],
            landmarks: [],
            links: [],
            formControls: [],
            liveRegions: [],
         },
         needsReviewItems: extractNeedsReviewItems(bundle, claimedChecks),
         checks: claimedChecks,
      };

      return { done: false, reason: 'claimed', packet };
   });
}

function createProposedVerdict(proposal: JudgeVerdictInput): Verdict {
   const item = verdictProposalSchema.parse(proposal);
   if (item.outcome === 'cantTell' && !item.blockerCode) {
      throw new CliUsageError(
         'blocker-code-required',
         'cantTell requires a valid blockerCode.',
      );
   }

   // 3. Validation for excluded: requires exclusionReason
   if (item.outcome === 'excluded' && !item.exclusionReason) {
      throw new CliUsageError(
         'exclusion-reason-required',
         `Excluded verdict for WCAG ${item.criterionId} requires an exclusionReason.`,
      );
   }

   const tier = item.tier ?? (item.outcome === 'excluded' ? TIER_ZERO : TIER_TWO);
   const confidence = item.confidence ?? (tier === TIER_ZERO ? 1 : DEFAULT_CONFIDENCE);
   const impact =
      item.impact ??
      (item.outcome === 'failed' ? getCriterionImpact(item.criterionId) : undefined);

   const nextAction =
      item.nextAction ??
      (item.outcome === 'needsReview' || item.outcome === 'cantTell'
         ? { kind: 'run-procedure' as const, summary: item.rationale }
         : undefined);

   const rawVerdict: Verdict = {
      id: computeVerdictId({ criterionId: item.criterionId, stateId: item.stateId }),
      criterionId: item.criterionId,
      stateId: item.stateId,
      procedureId: item.procedureId,
      blockerCode: item.blockerCode,
      assessment: item.assessment,
      tier,
      outcome: item.outcome,
      confidence,
      impact,
      method: item.method ?? 'agent-judgment',
      rationale: item.rationale,
      evidence: item.evidence ? [...item.evidence] : [],
      measurements: item.measurements ? [...item.measurements] : undefined,
      repro: item.repro
         ? [...item.repro]
         : [`State ${item.stateId} judged by review.judge`],
      nextAction,
      exclusionReason: item.exclusionReason,
      recordedAt: new Date().toISOString(),
   };

   return verdictSchema.parse(rawVerdict);
}

export async function judge(input: JudgeReviewInput): Promise<JudgeReviewResult> {
   const runDir = resolve(input.runDir);
   const lockPath = getReviewRunPath(runDir);

   return withPathLock(lockPath, async () => {
      const runState = await readReviewRunState(runDir);
      const previous = await readVerdicts(runDir);
      const identities = input.verdicts.map((item) =>
         JSON.stringify([item.stateId, item.criterionId, item.procedureId ?? '']),
      );
      if (new Set(identities).size !== identities.length) {
         throw new CliUsageError(
            'duplicate-judgment',
            'Submit each state, criterion and procedure only once per batch.',
         );
      }
      const validationResults = await Promise.allSettled(
         input.verdicts.map(async (item) => {
            try {
               const lease = runState.activeStateLeases[item.stateId];
               if (lease && isLeaseExpired(lease)) {
                  throw new CliUsageError(
                     'lease-expired',
                     'Claim the state again before submitting judgments.',
                  );
               }
               if (lease && lease.agentId !== (input.agentId ?? 'default-agent')) {
                  throw new CliUsageError(
                     'state-already-leased',
                     'Another agent owns the current state lease.',
                  );
               }
               const proposed = createProposedVerdict(item);
               const superseded = previous.find(
                  (entry) =>
                     entry.stateId === item.stateId &&
                     entry.criterionId === item.criterionId &&
                     entry.procedureId === item.procedureId,
               );
               proposed.actor = input.agentId ?? 'default-agent';
               if (superseded) {
                  proposed.supersedes = {
                     recordedAt: superseded.recordedAt,
                     digest: createHash('sha256')
                        .update(JSON.stringify(superseded))
                        .digest('hex'),
                  };
               }
               return await admitReviewVerdict({
                  runDir,
                  scope: runState,
                  verdict: proposed,
               });
            } catch (error) {
               await appendLine(join(runDir, 'verdict-proposals.jsonl'), {
                  actor: input.agentId ?? 'default-agent',
                  proposal: item,
                  recordedAt: new Date().toISOString(),
                  rejection: error instanceof Error ? error.message : String(error),
               });
               throw error;
            }
         }),
      );

      const rejected = validationResults.find((result) => result.status === 'rejected');
      if (rejected?.status === 'rejected') {
         const reason: unknown = rejected.reason;
         throw reason;
      }
      const validatedVerdicts = validationResults.flatMap((result) =>
         result.status === 'fulfilled' ? [result.value] : [],
      );

      // Append only after every proposal in the batch passed admission.
      for (const verdict of validatedVerdicts) {
         // oxlint-disable-next-line no-await-in-loop -- serial append under run path lock
         await recordVerdict(runDir, verdict);
      }

      const progressAt = new Date();

      // Update state leases in review-run.json
      for (const verdict of validatedVerdicts) {
         const lease = runState.activeStateLeases[verdict.stateId];
         if (lease) {
            const checkKey = `${verdict.stateId}:${verdict.criterionId}`;
            lease.claimedCheckIds = lease.claimedCheckIds.filter((id) => id !== checkKey);
            lease.lastProgressAt = progressAt.toISOString();
            lease.expiresAt = new Date(
               progressAt.getTime() + LEASE_DURATION_MS,
            ).toISOString();
         }
      }

      const nextLeases: Record<string, StateClaimLease> = {};
      for (const [key, leaseRecord] of Object.entries(runState.activeStateLeases)) {
         if (leaseRecord.claimedCheckIds.length > 0) {
            nextLeases[key] = leaseRecord;
         }
      }
      runState.activeStateLeases = nextLeases;
      runState.updatedAt = new Date().toISOString();
      await writeReviewRunState(runDir, runState);

      const allVerdicts = await readReviewVerdicts(runDir, runState);
      const decidedMap = getDecisionMap(runState, allVerdicts);

      const coverage = computeCoverage({
         states: runState.states,
         verdicts: allVerdicts,
         criterionIds: runState.coordinator
            ? listStateReviewCriteria(runState)
            : runState.criterionIds,
         broader: runState.coordinator
            ? listBroaderReviewObligations({
                 run: runState,
                 scope: await readCoordinatedReviewScope({
                    run: runState,
                    link: runState.coordinator,
                 }),
              })
            : [],
      });
      const judgedKeys = new Set(
         validatedVerdicts.map((verdict) =>
            getReviewCheckID(verdict.stateId, verdict.criterionId),
         ),
      );
      const closedCount = [...judgedKeys].filter(
         (key) => decidedMap.get(key)?.complete === true,
      ).length;

      return {
         recordedCount: validatedVerdicts.length,
         closedCount,
         remainingCount: coverage.unresolved,
         verdicts: validatedVerdicts,
      };
   });
}

function getObservationResult(
   bundle: ObservationBundle,
   stateId: string,
   slice?: ObservationBundleSliceName,
): ObserveReviewResult {
   const metadata = {
      stateId,
      fingerprint: bundle.fingerprint,
      digest: getObservationDigest(bundle),
      capturedAt: bundle.capturedAt,
   };
   if (slice) {
      return { ...metadata, slice, data: bundle[slice] };
   }
   return { ...metadata, bundle };
}

function assertObservationRevision(input: {
   current: ReviewRunState;
   previous: ReviewRunState;
   stateId: string;
}): void {
   const currentState = input.current.states.find(
      (state) => state.stateId === input.stateId,
   );
   const previousState = input.previous.states.find(
      (state) => state.stateId === input.stateId,
   );
   if (
      input.current.runId !== input.previous.runId ||
      JSON.stringify(currentState) !== JSON.stringify(previousState) ||
      JSON.stringify(input.current.exclusions) !==
         JSON.stringify(input.previous.exclusions)
   ) {
      throw new CliUsageError(
         'observation-raced',
         'The run or state changed during collection. Retry observation against its current revision.',
      );
   }
}

export async function observe(input: ObserveReviewInput): Promise<ObserveReviewResult> {
   const runDir = resolve(input.runDir);
   const runState = await readReviewRunState(runDir);
   const stateItem = runState.states.find((state) => state.stateId === input.stateId);

   if (
      stateItem?.excluded ||
      (stateItem && matchScopeExclusion(stateItem, runState.exclusions))
   ) {
      throw new CliUsageError('state-excluded', 'Excluded states cannot be observed.');
   }
   if (input.capture) {
      if (
         !input.browser ||
         !stateItem?.fingerprint ||
         input.setup ||
         input.slice ||
         input.targetUrl
      ) {
         throw new CliUsageError(
            'capture-input-invalid',
            'Condition capture requires a browser and an existing scoped state; setup, slice and target overrides are unsupported.',
         );
      }
      const bundle = await readCachedObservationBundle(runDir, stateItem.fingerprint);
      if (
         !bundle ||
         bundle.stateId !== stateItem.stateId ||
         bundle.targetUrl !== stateItem.targetUrl ||
         JSON.stringify(bundle.setup) !== JSON.stringify(stateItem.setup ?? []) ||
         JSON.stringify(bundle.excludedSelectors ?? []) !==
            JSON.stringify(
               listExcludedSelectors({
                  state: stateItem,
                  exclusions: runState.exclusions,
               }),
            )
      ) {
         throw new CliUsageError(
            'capture-root-invalid',
            'The condition capture root does not match the current state and exclusions.',
         );
      }
      const result = await captureCondition({
         browser: input.browser,
         cacheRoot: runDir,
         bundle,
         request: input.capture,
      });
      const current = await readReviewRunState(runDir);
      assertObservationRevision({ current, previous: runState, stateId: input.stateId });
      return {
         ...getObservationResult(bundle, input.stateId),
         bundle: undefined,
         data: result,
      };
   }
   if (input.browser) {
      const targetUrl = input.targetUrl ?? stateItem?.targetUrl;
      if (!targetUrl) {
         throw new CliUsageError('target-required', 'A new state requires a target URL.');
      }
      if (stateItem && targetUrl !== stateItem.targetUrl) {
         throw new CliUsageError(
            'state-target-mismatch',
            'Register a different state ID for a different target URL.',
         );
      }
      if (
         matchScopeExclusion({ stateId: input.stateId, targetUrl }, runState.exclusions)
      ) {
         throw new CliUsageError('state-excluded', 'Excluded states cannot be observed.');
      }
      const { bundle } = await observeState({
         browser: input.browser,
         excludedSelectors: listExcludedSelectors({
            state: { stateId: input.stateId, targetUrl },
            exclusions: runState.exclusions,
         }),
         targetUrl,
         stateId: input.stateId,
         setup: input.setup ?? stateItem?.setup ?? [],
         useCache: false,
         cacheRoot: runDir,
      });

      await withPathLock(getReviewRunPath(runDir), async () => {
         const current = await readReviewRunState(runDir);
         const currentState = current.states.find(
            (state) => state.stateId === input.stateId,
         );
         assertObservationRevision({
            current,
            previous: runState,
            stateId: input.stateId,
         });
         if (currentState) {
            currentState.fingerprint = bundle.fingerprint;
            currentState.setup = bundle.setup;
         } else {
            current.states.push({
               stateId: input.stateId,
               targetUrl,
               fingerprint: bundle.fingerprint,
               setup: bundle.setup,
            });
         }
         current.updatedAt = new Date().toISOString();
         await writeReviewRunState(runDir, current);
      });

      return getObservationResult(bundle, input.stateId, input.slice);
   }

   if (!stateItem?.fingerprint) {
      throw new CliUsageError(
         'state-bundle-not-found',
         `No cached observation bundle found for state ${input.stateId}.`,
      );
   }

   const bundle = await readCachedObservationBundle(runDir, stateItem.fingerprint);
   if (!bundle) {
      throw new CliUsageError(
         'bundle-cache-miss',
         `Observation bundle ${stateItem.fingerprint} not found in cache.`,
      );
   }

   return getObservationResult(bundle, input.stateId, input.slice);
}

export async function status(input: StatusReviewInput): Promise<StatusReviewResult> {
   const runDir = resolve(input.runDir);
   return withPathLock(getReviewRunPath(runDir), async () => {
      const runState = await readReviewRunState(runDir);
      const verdicts = await readReviewVerdicts(runDir, runState);

      const stateCriteria = runState.coordinator
         ? listStateReviewCriteria(runState)
         : runState.criterionIds;
      const coordinatedScope = runState.coordinator
         ? await readCoordinatedReviewScope({ run: runState, link: runState.coordinator })
         : undefined;
      const broaderObligations = coordinatedScope
         ? listBroaderReviewObligations({ run: runState, scope: coordinatedScope })
         : [];
      const decidedMap = getDecisionMap(
         { ...runState, criterionIds: stateCriteria },
         verdicts,
      );

      const coverage = computeCoverage({
         states: runState.states,
         verdicts,
         criterionIds: stateCriteria,
         broader: broaderObligations,
      });
      const activeLeases = Object.values(
         getActiveStateLeases(runState.activeStateLeases),
      );

      // Collect actionable items
      const actionableItems: ActionableReviewItem[] = [];

      for (const stateItem of runState.states) {
         if (stateItem.excluded) {
            continue;
         }
         const openChecks = findOpenChecksForState({
            state: stateItem,
            criterionIds: stateCriteria,
            decidedCheckMap: decidedMap,
         });
         for (const check of openChecks) {
            actionableItems.push({
               checkId: check.checkId,
               stateId: check.stateId,
               criterionId: check.criterionId,
               impact: check.impact,
               kind: activeLeases.some(
                  (lease) =>
                     lease.stateId === stateItem.stateId &&
                     lease.agentId !== (input.agentId ?? 'default-agent'),
               )
                  ? 'leased'
                  : 'claimable',
               reason: `Tier-2 manual assessment required for WCAG ${check.criterionId}`,
            });
         }
      }

      const sortedActionable = actionableItems.toSorted((left, right) =>
         compareClaimableWork(
            {
               id: left.checkId,
               stateId: left.stateId,
               criterionId: left.criterionId,
               impact: left.impact,
            },
            {
               id: right.checkId,
               stateId: right.stateId,
               criterionId: right.criterionId,
               impact: right.impact,
            },
         ),
      );

      const execution = getReviewExecutionState({
         runDir,
         agentId: input.agentId ?? 'default-agent',
         coverage,
         finalReady:
            coverage.unresolved === 0 &&
            !buildCurrentReviewReport({ runState, verdicts, coordinatedScope }).isDraft,
         stateWorkAvailable: actionableItems.some((item) => item.kind === 'claimable'),
         activeLeases,
         scopeGaps: runState.scopeGaps ?? [],
         blockers: listBlockedReviewReasons(decidedMap, verdicts),
         broader: broaderObligations,
         coordinator: runState.coordinator,
         scope: coordinatedScope,
      });

      if (input.full === true) {
         return {
            runId: runState.runId,
            targetOrigin: runState.targetOrigin,
            scopeGaps: runState.scopeGaps ?? [],
            coverage,
            execution,
            broaderObligations,
            activeLeases,
            actionable: sortedActionable,
            pageVerdicts: computePageVerdicts(runState.states, verdicts, stateCriteria),
            states: runState.states,
            verdicts,
         };
      }

      return {
         runId: runState.runId,
         targetOrigin: runState.targetOrigin,
         scopeGaps: runState.scopeGaps ?? [],
         coverage,
         execution,
         broaderObligations,
         activeLeases,
         actionable: sortedActionable.slice(0, MAX_ACTIONABLE_STATUS_ITEMS),
      };
   });
}

/** Attach existing scope without recollecting roots or replacing leases and history. */
export async function resume(input: {
   runDir: string;
   runId: string;
   agentId?: string | undefined;
   coordinator?: ReviewCoordinatorLink | undefined;
}): Promise<StatusReviewResult> {
   const runDir = resolve(input.runDir);
   await withPathLock(getReviewRunPath(runDir), async () => {
      const current = await readReviewRunState(runDir);
      if (current.runId !== input.runId) {
         throw new CliUsageError(
            'review-run-mismatch',
            'Resume requires the current review run ID.',
         );
      }
      const coordinator = input.coordinator ?? current.coordinator;
      const save = async (): Promise<void> => {
         await writeReviewRunState(runDir, {
            ...current,
            ...(coordinator ? { coordinator } : {}),
            activeStateLeases: getActiveStateLeases(current.activeStateLeases),
            updatedAt: new Date().toISOString(),
         });
      };
      if (coordinator) {
         await withCoordinatedReviewScope({ run: current, link: coordinator }, save);
         return;
      }
      await save();
   });
   return status({ runDir, agentId: input.agentId });
}

export async function report(input: ReportReviewInput): Promise<ReportReviewResult> {
   const runDir = resolve(input.runDir);
   return withPathLock(getReviewRunPath(runDir), async () => {
      const runState = await readReviewRunState(runDir);
      const verdicts = await readReviewVerdicts(runDir, runState);

      const buildAndWrite = async (
         scope?: Awaited<ReturnType<typeof readCoordinatedReviewScope>>,
      ): Promise<ReportReviewResult> => {
         const auditReport = buildCurrentReviewReport({
            runState,
            verdicts,
            coordinatedScope: scope,
            forceDraft: input.draft === true,
         });
         if (input.draft === false && auditReport.isDraft) {
            throw new CliUsageError(
               'review-incomplete',
               'Final report refused: required assessments or current evidence are incomplete. Generate a draft or collect the missing evidence.',
            );
         }

         const outDir = input.outDir ? resolve(input.outDir) : runDir;

         if (input.outDir && resolve(input.outDir) !== runDir) {
            await withDirectoryCommit(outDir, async (stagingDir) => {
               await writeVerdictAuditReportFiles(stagingDir, auditReport);
            });
            return {
               report: auditReport,
               paths: {
                  jsonPath: join(outDir, 'verdict-report.json'),
                  htmlPath: join(outDir, 'verdict-report.html'),
                  markdownPath: join(outDir, 'verdict-report.md'),
               },
            };
         }

         const paths = await writeVerdictAuditReportFiles(outDir, auditReport);
         return {
            report: auditReport,
            paths,
         };
      };
      return runState.coordinator
         ? withCoordinatedReviewScope(
              { run: runState, link: runState.coordinator },
              buildAndWrite,
           )
         : buildAndWrite();
   });
}

export async function run(input: RunReviewInput): Promise<RunReviewResult> {
   const startResult = await start(input);
   let draftReport: ReportReviewResult | undefined;

   if (input.draftReport !== false) {
      draftReport = await report({
         runDir: input.runDir,
         draft: true,
      });
   }

   const nextResult = await next({
      runDir: input.runDir,
      count: input.nextCount ?? DEFAULT_BATCH_COUNT,
   });

   return {
      runId: startResult.runId,
      startResult,
      draftReport,
      firstPacket: nextResult.packet,
   };
}

export const review = {
   start,
   resume,
   next,
   judge,
   observe,
   status,
   report,
   run,
};
