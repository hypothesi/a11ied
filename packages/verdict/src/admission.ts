import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
   verdictSchema,
   mediaInventorySchema,
   type AssessmentEvidenceKind,
   type CriterionId,
   type ConditionCapture,
   type ObservationBundle,
   type ObservationRef,
   type ScopeExclusionRule,
   type StateSetupAction,
   type Verdict,
   type ProcedureAssessment,
} from '@a11ied/contracts';
import {
   getObservationDigest,
   judgeMediaInventory,
   validateObservationReceipt,
   resolveConditionEvidence,
   type ConditionEvidence,
   readCachedObservationBundle,
} from '@a11ied/observe';
import { markAcceptedVerdict } from './admission-state.js';
import { collectMeasurements, scoreCriterionVerdict } from './engine.js';
import { CliUsageError } from './errors.js';
import { isProcedureAssessmentComplete } from './obligations.js';
import { getMissingCapabilities, getRequiredEvidence } from './procedure-requirements.js';
import { resolveEvidenceProcedure } from './procedure.js';
import { readVerdicts } from './store.js';
import { verifyBundleInapplicability } from './inapplicability.js';
import { matchScopeExclusion, listExcludedSelectors } from './template-dedupe.js';

const AGENT_TIER = 2;
const HTTP_ERROR_STATUS = 400;

export interface ReviewEvidenceScope {
   states: readonly {
      stateId: string;
      targetUrl: string;
      fingerprint?: string | undefined;
      setup?: readonly StateSetupAction[] | undefined;
      excluded?: boolean | undefined;
   }[];
   criterionIds: readonly CriterionId[];
   exclusions: readonly ScopeExclusionRule[];
}

function reject(reason: string): never {
   throw new CliUsageError('verdict-evidence-rejected', reason);
}

function getSectionKind(
   bundle: ObservationBundle,
   section: string,
): AssessmentEvidenceKind {
   if (
      section === 'collectionTrace' &&
      bundle.collectionTrace?.some(
         (entry) => entry.status === 'completed' && entry.stateId === bundle.stateId,
      )
   ) {
      return 'action-trace';
   }
   if (
      section === 'facts.mediaInventory' &&
      mediaInventorySchema.safeParse(bundle.facts.mediaInventory).success
   ) {
      return 'media';
   }
   if (section === 'transcript' && bundle.transcript.spokenOrder.length > 0) {
      return 'speech';
   }
   if (section === 'contrast' && bundle.contrast.length > 0) {
      return 'measurement';
   }
   if (
      section === 'textResize' &&
      bundle.textResize &&
      bundle.textResize.verifiedCount > 0
   ) {
      return 'measurement';
   }
   if (section === 'viewports') {
      return 'measurement';
   }
   if (
      section === 'facts' ||
      section === 'tree' ||
      section === 'axe' ||
      section === 'axe.violations'
   ) {
      return 'observation';
   }
   return reject(`No usable evidence at bundle section '${section}'.`);
}

function getScreenshotDigest(
   bundle: ObservationBundle,
   file: string,
): string | undefined {
   if (file === resolve(bundle.screenshots.fullPagePath)) {
      return bundle.screenshots.fullPageDigest;
   }
   if (bundle.textResize && file === resolve(bundle.textResize.screenshotPath)) {
      return bundle.textResize.screenshotDigest;
   }
   return undefined;
}

async function resolveAdditionalEvidence(input: {
   runDir: string;
   bundle: ObservationBundle;
   file: string;
   fragment: string | undefined;
   captures: Map<string, Promise<ConditionCapture>>;
   conditions: ConditionEvidence[];
}): Promise<AssessmentEvidenceKind> {
   try {
      const condition = await resolveConditionEvidence({
         runDir: input.runDir,
         bundle: input.bundle,
         file: input.file,
         fragment: input.fragment,
         captures: input.captures,
      });
      if (condition) {
         input.conditions.push(condition);
         return condition.kind;
      }
   } catch (error) {
      reject(
         `Invalid condition evidence: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
   return reject(
      'Evidence must resolve to a collected section or registered screenshot.',
   );
}

async function resolveEvidenceKind(input: {
   runDir: string;
   bundle: ObservationBundle;
   ref: ObservationRef;
   digest: string;
   captures: Map<string, Promise<ConditionCapture>>;
   conditions: ConditionEvidence[];
}): Promise<AssessmentEvidenceKind> {
   const { bundle, ref, runDir } = input;
   if (ref.path.indexOf('#') !== ref.path.lastIndexOf('#')) {
      reject('Evidence path has multiple fragments.');
   }
   if (ref.fingerprint !== bundle.fingerprint || ref.digest !== input.digest) {
      reject('Evidence is stale or does not identify the current observation snapshot.');
   }
   if (ref.pointer) {
      reject(
         'This evidence pointer is unsupported; reference an observed bundle section or screenshot.',
      );
   }
   const [file, fragment] = ref.path.split('#'),
      bundleFile = resolve(runDir, 'cache', bundle.fingerprint, 'bundle.json'),
      referencedFile = resolve(
         runDir,
         ref.path.startsWith('bundle.json')
            ? `cache/${bundle.fingerprint}/${file}`
            : (file ?? ''),
      );
   if (referencedFile === bundleFile && fragment) {
      return getSectionKind(bundle, fragment);
   }
   const screenshotDigest = getScreenshotDigest(bundle, referencedFile);
   if (screenshotDigest && !fragment) {
      const bytes = await readFile(referencedFile),
         digest = createHash('sha256').update(bytes).digest('hex');
      if (digest !== screenshotDigest) {
         reject('Screenshot bytes do not match the collector receipt.');
      }
      return 'screenshot';
   }
   return resolveAdditionalEvidence({ ...input, file: referencedFile, fragment });
}

function validateMeasurements(verdict: Verdict, bundle: ObservationBundle): void {
   const collected = collectMeasurements(bundle, verdict.criterionId) ?? [];
   for (const measurement of verdict.measurements ?? []) {
      const matching = collected.some(
         (entry) =>
            entry.metric === measurement.metric &&
            entry.value === measurement.value &&
            entry.unit === measurement.unit &&
            entry.target === measurement.target &&
            entry.threshold === measurement.threshold &&
            entry.pass === measurement.pass,
      );
      if (!matching) {
         reject(
            `Measurement '${measurement.metric}' is unsupported by the current collector receipt.`,
         );
      }
   }
}

export function validateProcedureActionOutcomes(
   verdict: Pick<Verdict, 'outcome'>,
   actions: readonly Pick<ProcedureAssessment['actions'][number], 'outcome'>[],
): void {
   if (verdict.outcome === 'failed') {
      if (!actions.some((action) => action.outcome === 'failed')) {
         reject('A failure requires a failed action with supporting evidence.');
      }
      return;
   }
   if (
      actions.some(
         (action) => action.outcome === 'failed' || action.outcome === 'cantTell',
      )
   ) {
      reject('Action outcomes contradict the proposed conformance judgment.');
   }
   if (
      verdict.outcome === 'inapplicable' &&
      actions.some((action) => action.outcome !== 'inapplicable')
   ) {
      reject(
         'Inapplicability requires consistent action outcomes and applicability evidence.',
      );
   }
}

function validateAssessmentActions(verdict: Verdict): void {
   const assessment = verdict.assessment,
      procedure = resolveEvidenceProcedure(verdict);
   if (!assessment || assessment.version !== procedure.version) {
      reject(
         'Record the recognized procedure version and evidence-backed observations for every required action.',
      );
   }
   const indices = new Set(assessment.actions.map((action) => action.index));
   if (
      indices.size !== assessment.actions.length ||
      assessment.actions.some((action) => action.index >= procedure.actions.length)
   ) {
      reject('Assessment action indices do not match this procedure.');
   }
   if (verdict.outcome !== 'failed' && !isProcedureAssessmentComplete(verdict)) {
      reject('Record evidence-backed observations for every required action.');
   }
   validateProcedureActionOutcomes(verdict, assessment.actions);
}

function validateApplicability(verdict: Verdict, bundle: ObservationBundle): void {
   const isInapplicable = verdict.outcome === 'inapplicable',
      procedure = resolveEvidenceProcedure(verdict);
   const absenceKind =
      procedure.inapplicability?.kind ?? procedure.done?.inapplicabilityKind;
   if (isInapplicable && absenceKind === 'media-absence') {
      const inventory = mediaInventorySchema.safeParse(bundle.facts.mediaInventory);
      if (
         !inventory.success ||
         inventory.data.url !== bundle.targetUrl ||
         judgeMediaInventory(inventory.data).outcome !== 'inapplicable'
      ) {
         reject(
            'Media absence requires a complete current inventory without uninspected trees or observed media.',
         );
      }
   }
   if (
      isInapplicable &&
      absenceKind &&
      verifyBundleInapplicability(bundle, absenceKind).observedCount > 0
   ) {
      reject(
         'Matching content is observed; this criterion cannot be marked inapplicable.',
      );
   }
}

function validateProcedure(
   verdict: Verdict,
   bundle: ObservationBundle,
   kinds: readonly AssessmentEvidenceKind[],
): void {
   validateAssessmentActions(verdict);
   const isInapplicable = verdict.outcome === 'inapplicable';
   const procedure = resolveEvidenceProcedure(verdict);
   if (procedure.scope === 'journey' || procedure.scope === 'site') {
      reject(
         'This procedure requires broader-scope evidence; a single-state observation cannot establish its result.',
      );
   }
   validateApplicability(verdict, bundle);

   const missing = getMissingCapabilities({
      procedure,
      capabilities: bundle.environment?.capabilities ?? [],
      isInapplicable,
   });
   if (
      !bundle.environment ||
      bundle.environment.platform !== 'virtual' ||
      missing.length > 0
   ) {
      reject(
         `Required collector environment or capabilities are unavailable: ${missing.join(', ')}.`,
      );
   }
   if (
      getRequiredEvidence(procedure, isInapplicable).some((kind) => !kinds.includes(kind))
   ) {
      reject(
         'Required procedure evidence kinds are missing; collect the procedure actions before judging.',
      );
   }
   if (
      getRequiredEvidence(procedure, isInapplicable).includes('measurement') &&
      !verdict.measurements?.length
   ) {
      reject('This procedure requires recorded measurements.');
   }
   if (verdict.method !== 'agent-judgment' && verdict.method !== 'virtual-sr') {
      reject(
         'Procedure assessments require agent-judgment or verified virtual-sr provenance; native receipts are unavailable in this collector.',
      );
   }
   if (verdict.tier !== AGENT_TIER) {
      reject(
         'An agent procedure assessment cannot assign itself an automated or native tier.',
      );
   }
}

async function validateCollectorReceipt(
   runDir: string,
   bundle: ObservationBundle,
): Promise<void> {
   try {
      await validateObservationReceipt({ cacheRoot: runDir, bundle });
   } catch (error) {
      reject(
         `Collect fresh evidence: invalid collector receipt. ${error instanceof Error ? error.message : String(error)}`,
      );
   }
}

async function getCurrentBundle(input: {
   runDir: string;
   state: ReviewEvidenceScope['states'][number];
   exclusions: ReviewEvidenceScope['exclusions'];
}): Promise<ObservationBundle> {
   const { runDir, state } = input;
   const bundle = state.fingerprint
      ? await readCachedObservationBundle(runDir, state.fingerprint)
      : undefined;
   if (
      !bundle ||
      bundle.stateId !== state.stateId ||
      bundle.targetUrl !== state.targetUrl ||
      JSON.stringify(bundle.setup) !== JSON.stringify(state.setup ?? [])
   ) {
      reject('No current observation matches this state, target and setup.');
   }
   if (
      JSON.stringify(bundle.excludedSelectors ?? []) !==
      JSON.stringify(listExcludedSelectors({ state, exclusions: input.exclusions }))
   ) {
      reject(
         'The observation does not match the current excluded-content scope. Collect fresh evidence.',
      );
   }
   const navigation = bundle.navigation;
   if (navigation) {
      const observed = new URL(navigation.observedURL),
         requested = new URL(navigation.requestedURL);
      if (
         (navigation.status ?? 0) >= HTTP_ERROR_STATUS ||
         requested.origin !== observed.origin ||
         requested.pathname !== observed.pathname ||
         requested.search !== observed.search
      ) {
         reject(
            'The requested page was not verified at its registered URL; register and inspect the resolved target separately.',
         );
      }
   }
   await validateCollectorReceipt(runDir, bundle);
   return bundle;
}

function getVerifiedAxeFailure(
   verdict: Verdict,
   bundle: ObservationBundle,
): Verdict | undefined {
   if (verdict.assessment || verdict.method !== 'axe' || verdict.outcome !== 'failed') {
      return undefined;
   }
   const computed = scoreCriterionVerdict(bundle, verdict.criterionId);
   if (computed.outcome !== 'failed' || computed.method !== 'axe' || verdict.tier !== 0) {
      reject('The collector does not establish this deterministic failure.');
   }
   return {
      ...computed,
      actor: verdict.actor,
      supersedes: verdict.supersedes,
      recordedAt: verdict.recordedAt,
   };
}

/** One admission policy for proposed judgments, with revalidation on every consumption. */
interface AdmissionInput {
   runDir: string;
   scope: ReviewEvidenceScope;
   verdict: Verdict;
}

function validateConditionEvidence(
   verdict: Verdict,
   evidence: readonly ConditionEvidence[],
): void {
   const required = {
      '1.4.4': 'text200',
      '1.4.10': 'reflow320',
      '1.4.12': 'textSpacing',
   };
   if (verdict.outcome !== 'passed' || !(verdict.criterionId in required)) {
      return;
   }
   const condition = Object.entries(required).find(
      ([id]) => id === verdict.criterionId,
   )?.[1];
   const selected = evidence.filter((entry) => entry.condition === condition);
   if (
      !['action-trace', 'screenshot', 'observation'].every((kind) =>
         selected.some((entry) => entry.kind === kind),
      )
   ) {
      reject(
         'A layout pass requires a verified condition capture with observations, actual interactions and screenshots.',
      );
   }
}

async function validateObservedVerdict(
   runDir: string,
   bundle: ObservationBundle,
   verdict: Verdict,
): Promise<Verdict> {
   if (verdict.evidence.length === 0) {
      reject('A terminal judgment requires evidence references.');
   }
   const refs = [
      ...verdict.evidence,
      ...(verdict.assessment?.actions.flatMap((action) => action.evidence) ?? []),
   ];
   const digest = getObservationDigest(bundle);
   const conditions: ConditionEvidence[] = [];
   const captures = new Map<string, Promise<ConditionCapture>>();
   const kinds = await Promise.all(
      refs.map((ref) =>
         resolveEvidenceKind({ runDir, bundle, ref, digest, captures, conditions }),
      ),
   );
   validateConditionEvidence(verdict, conditions);
   validateMeasurements(verdict, bundle);
   const automatedFailure = getVerifiedAxeFailure(verdict, bundle);
   if (automatedFailure) {
      return automatedFailure;
   }
   const deterministic = scoreCriterionVerdict(bundle, verdict.criterionId);
   if (
      deterministic.method === 'axe' &&
      deterministic.outcome === 'failed' &&
      verdict.outcome !== 'failed'
   ) {
      reject('A current deterministic violation contradicts the proposed judgment.');
   }
   validateProcedure(verdict, bundle, kinds);
   return verdict;
}

async function admitWithSnapshot(
   input: AdmissionInput,
   bundles: Map<string, Promise<ObservationBundle>>,
): Promise<Verdict> {
   const { runDir, scope } = input;
   const verdict = verdictSchema.parse(input.verdict);
   const state = scope.states.find((entry) => entry.stateId === verdict.stateId);
   if (!state || !scope.criterionIds.includes(verdict.criterionId)) {
      reject('The proposed judgment does not identify a registered obligation.');
   }
   if (verdict.outcome === 'cantTell' && !verdict.blockerCode) {
      reject('cantTell requires a valid blockerCode.');
   }
   if (verdict.outcome === 'needsReview' || verdict.outcome === 'cantTell') {
      return verdict;
   }
   if (verdict.outcome === 'excluded') {
      if (
         !state.excluded &&
         !matchScopeExclusion(
            { ...state, criterionId: verdict.criterionId },
            scope.exclusions,
         )
      ) {
         reject('Exclusion is not authorized by the recorded scope.');
      }
      return markAcceptedVerdict(verdict, state);
   }
   let pending = bundles.get(state.stateId);
   if (!pending) {
      pending = getCurrentBundle({ runDir, state, exclusions: scope.exclusions });
      bundles.set(state.stateId, pending);
   }
   const bundle = await pending;
   return markAcceptedVerdict(
      await validateObservedVerdict(runDir, bundle, verdict),
      state,
   );
}

/** Validate a proposal against a fresh observation snapshot. */
export async function admitReviewVerdict(input: AdmissionInput): Promise<Verdict> {
   return admitWithSnapshot(input, new Map());
}

export function unresolvedProposal(verdict: Verdict, error: unknown): Verdict {
   return {
      ...verdict,
      outcome: 'needsReview',
      confidence: 0,
      rationale: `Unaccepted proposal: ${error instanceof Error ? error.message : String(error)} Original claim: ${verdict.rationale}`,
      nextAction: {
         kind: 'run-procedure',
         summary: 'Collect current procedure evidence and resubmit the judgment.',
      },
   };
}

/** Raw records remain durable; rejected claims become actionable unresolved results. */
export async function readReviewVerdicts(
   runDir: string,
   scope: ReviewEvidenceScope,
): Promise<Verdict[]> {
   const records = await readVerdicts(runDir);
   const bundles = new Map<string, Promise<ObservationBundle>>();
   return Promise.all(
      records.map(async (verdict) => {
         try {
            return await admitWithSnapshot({ runDir, scope, verdict }, bundles);
         } catch (error) {
            return unresolvedProposal(verdict, error);
         }
      }),
   );
}
