import type {
   AssessmentCheck,
   AssessmentEvidenceKind,
   AuditRun,
   EvidenceOutcome,
   EvidenceRecord,
} from '@a11ied/contracts';
import type { Browser } from 'playwright';
import { launchAutomationBrowser } from '../../browser/runtime.js';
import { recordEvidence } from '../../evidence/store.js';
import { executeAuditAssessment } from '../assessment-command.js';
import { getAuditRunPaths, readAuditRun } from '../run-store.js';
import { judgeCriterion } from './judge.js';
import { observeInventoryPages } from './probe-observe.js';
import {
   writeProbeArtifacts,
   type ArtifactInput,
   type PageJudgement,
   type StateReference,
} from './probe-artifacts.js';
import { buildSiteFacts, PageEvidenceCache } from './probe-site.js';
import type { Judgement, SiteFacts } from './probe-types.js';

const ACTOR_NAME = 'a1 audit probe';
const MAX_RECOVERY_ROUNDS = 3;
const NOTE_LIMIT = 900;
const SCREENSHOT = { width: 200, height: 120 };
const SETTLE_MS = 300;
const OUTCOME_ORDER: EvidenceOutcome[] = ['failed', 'cantTell', 'passed', 'inapplicable'];

export interface ProbeRunOptions {
   file: string;
   /** Stop after this many checks. Defaults to every check the browser can decide. */
   limit?: number | undefined;
   onProgress?: ((line: string) => void) | undefined;
}

export interface ProbeRunResult {
   attempted: number;
   outcomes: Record<EvidenceOutcome, number>;
}

type Claim = NonNullable<Awaited<ReturnType<typeof executeAuditAssessment>>['next']>;

interface RunContext {
   file: string;
   cache: PageEvidenceCache;
   browser: Browser;
   site: SiteFacts;
}

function foldJudgements(pages: PageJudgement[]): Judgement {
   const ordered = pages.toSorted(
      (first, second) =>
         OUTCOME_ORDER.indexOf(first.judgement.outcome) -
         OUTCOME_ORDER.indexOf(second.judgement.outcome),
   );
   const [lead] = ordered;
   if (!lead) {
      return { outcome: 'cantTell', rationale: 'No state was available to judge.' };
   }
   const everyInapplicable = pages.every(
      (page) => page.judgement.outcome === 'inapplicable',
   );
   const outcome =
      lead.judgement.outcome === 'inapplicable' && !everyInapplicable
         ? 'passed'
         : lead.judgement.outcome;
   const rationale =
      pages.length === 1
         ? lead.judgement.rationale
         : `${String(pages.length)} states judged; first ${outcome}: ${lead.url}: ${lead.judgement.rationale}`;
   return {
      outcome,
      rationale,
      ...(lead.judgement.finding ? { finding: lead.judgement.finding } : {}),
   };
}

function statesForCheck(run: AuditRun, check: AssessmentCheck): AuditRun['states'] {
   if (check.stateIds.length === 0) {
      return run.states.filter((state) => state.environmentId === check.environmentId);
   }
   return check.stateIds.flatMap((stateId) => {
      const state = run.states.find((entry) => entry.stateId === stateId);
      return state ? [state] : [];
   });
}

function toReferences(states: AuditRun['states']): StateReference[] {
   return states.map((state) => ({
      stateId: state.stateId,
      revision: state.revision,
      fingerprint: state.fingerprint,
   }));
}

async function captureScreenshot(browser: Browser, url: string): Promise<Buffer> {
   const context = await browser.newContext({ viewport: SCREENSHOT });
   try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SETTLE_MS);
      return await page.screenshot();
   } finally {
      await context.close();
   }
}

/** Artifact paths must be registered on the states they observed before recording. */
async function registerArtifactPaths(
   file: string,
   states: AuditRun['states'],
   paths: string[],
): Promise<void> {
   for (const state of states) {
      // oxlint-disable-next-line no-await-in-loop -- state writes are serialized by the run file
      await executeAuditAssessment({
         action: 'state',
         file,
         state: {
            stateId: state.stateId,
            target: state.target,
            label: state.label,
            fingerprint: state.fingerprint,
            environmentId: state.environmentId,
            setup: state.setup,
            artifacts: [...new Set([...state.artifacts, ...paths])],
         },
      });
   }
}

async function judgePages(
   context: RunContext,
   claim: Claim,
   states: AuditRun['states'],
): Promise<PageJudgement[]> {
   return Promise.all(
      states.map(async (state) => {
         const { facts, axe } = await context.cache.get(state.target.value);
         return {
            url: state.target.value,
            judgement: judgeCriterion(claim.check.criterionId, {
               facts,
               axe,
               site: context.site,
            }),
         };
      }),
   );
}

interface RecordInput {
   run: AuditRun;
   check: AssessmentCheck;
   procedure: Claim['procedure'];
   folded: Judgement;
   states: AuditRun['states'];
   artifacts: Awaited<ReturnType<typeof writeProbeArtifacts>>;
}

function buildRecord(input: RecordInput): EvidenceRecord {
   const { run, check, procedure, folded, states, artifacts } = input;
   return {
      subject: states[0]?.target.value ?? run.target.value,
      test: {
         kind: 'criterion',
         criterionId: check.criterionId,
         procedureId: check.procedureId,
      },
      outcome: folded.outcome,
      mode: 'semiAutomatic',
      recordedAt: new Date().toISOString(),
      note: folded.rationale.slice(0, NOTE_LIMIT),
      assertedBy: ACTOR_NAME,
      ...(folded.finding ? { finding: folded.finding } : {}),
      provenance: {
         version: '1',
         runId: run.runId,
         attempt: check.attempts,
         environmentId: check.environmentId,
         states: toReferences(states),
         actor: { kind: 'agent', name: ACTOR_NAME },
         source: 'browser',
         checkId: check.checkId,
         wcagVersion: run.profile.wcagVersion,
         procedureVersion: procedure.version,
         actions: { start: 0, end: states.length, checkpoint: check.checkId },
         artifacts,
         rationale: folded.rationale,
      },
   };
}

async function runClaim(context: RunContext, claim: Claim): Promise<EvidenceOutcome> {
   const { check, procedure } = claim;
   const run = await readAuditRun(context.file);
   const states = statesForCheck(run, check);
   const pages = await judgePages(context, claim, states);
   const folded = foldJudgements(pages);
   const artifactInput: Omit<ArtifactInput, 'states'> = {
      runFile: context.file,
      runId: run.runId,
      checkId: check.checkId,
      attempt: check.attempts,
      environmentId: check.environmentId,
      kinds: [
         ...new Set<AssessmentEvidenceKind>([
            'observation',
            'action-trace',
            ...procedure.requiredEvidence,
         ]),
      ],
      pages,
      rationale: folded.rationale,
      captureScreenshot: (url) => captureScreenshot(context.browser, url),
   };
   const first = await writeProbeArtifacts({
      ...artifactInput,
      states: toReferences(states),
   });
   await registerArtifactPaths(
      context.file,
      states,
      first.map((artifact) => artifact.path),
   );
   const refreshed = statesForCheck(await readAuditRun(context.file), check);
   const artifacts = await writeProbeArtifacts({
      ...artifactInput,
      states: toReferences(refreshed),
   });
   const { record } = await recordEvidence(
      buildRecord({ run, check, procedure, folded, states: refreshed, artifacts }),
      {
         file: getAuditRunPaths(context.file).evidenceFile,
         runFile: context.file,
         wcagVersion: run.profile.wcagVersion,
      },
   );
   await executeAuditAssessment({
      action: 'evaluate',
      file: context.file,
      checkId: check.checkId,
      outcome: folded.outcome,
      evidenceIds: [record.evidenceId ?? ''],
   });
   return folded.outcome;
}

async function collectIssueChecks(file: string): Promise<string[]> {
   const ids: string[] = [];
   for (let offset = 0; ;) {
      // oxlint-disable-next-line no-await-in-loop -- pages depend on the previous offset
      const page = await executeAuditAssessment({
         action: 'status',
         file,
         offset,
         limit: 100,
      });
      for (const issue of page.issues.items) {
         if (issue.checkId && /blocked|stale/.test(issue.code)) {
            ids.push(issue.checkId);
         }
      }
      if (page.issues.nextOffset === undefined) {
         return ids;
      }
      offset = page.issues.nextOffset;
   }
}

/** Interrupted and out-of-date claims are retried only after the run preserves them. */
async function recoverChecks(file: string): Promise<number> {
   const run = await readAuditRun(file);
   if (run.activeCheckId) {
      await executeAuditAssessment({ action: 'resume', file });
   }
   const retryCheckIds = await collectIssueChecks(file);
   if (retryCheckIds.length > 0) {
      await executeAuditAssessment({ action: 'resume', file, retryCheckIds });
   }
   return retryCheckIds.length;
}

async function drainClaims(
   context: RunContext,
   options: ProbeRunOptions,
   result: ProbeRunResult,
): Promise<void> {
   while (options.limit === undefined || result.attempted < options.limit) {
      // oxlint-disable-next-line no-await-in-loop -- one claim is active at a time
      const { next } = await executeAuditAssessment({
         action: 'next',
         file: context.file,
      });
      if (!next) {
         return;
      }
      // oxlint-disable-next-line no-await-in-loop -- the claim must finish before the next
      const outcome = await runClaim(context, next);
      result.attempted += 1;
      result.outcomes[outcome] += 1;
      options.onProgress?.(`${next.check.criterionId} ${outcome}`);
   }
}

async function drainWithRecovery(
   context: RunContext,
   options: ProbeRunOptions,
   result: ProbeRunResult,
): Promise<void> {
   for (let round = 0; round < MAX_RECOVERY_ROUNDS; round += 1) {
      // oxlint-disable-next-line no-await-in-loop -- each round depends on the last
      await drainClaims(context, options, result);
      // oxlint-disable-next-line no-await-in-loop -- recovery follows the drained queue
      if ((await recoverChecks(context.file)) === 0) {
         return;
      }
   }
}

/**
 * Decide every claimable check a browser can settle, recording verified evidence for
 * each. Checks that need a screen reader, or a person, stay unclaimed.
 */
export async function runAuditProbes(options: ProbeRunOptions): Promise<ProbeRunResult> {
   const { file } = options;
   const result: ProbeRunResult = {
      attempted: 0,
      outcomes: { passed: 0, failed: 0, cantTell: 0, inapplicable: 0 },
   };
   await recoverChecks(file);
   const { browser } = await launchAutomationBrowser();
   try {
      await observeInventoryPages(file, browser);
      const run = await readAuditRun(file);
      const cache = new PageEvidenceCache(browser);
      const urls = [...new Set(run.states.map((state) => state.target.value))];
      const site = await buildSiteFacts(cache, urls);
      const context: RunContext = { file, cache, browser, site };
      await drainWithRecovery(context, options, result);
   } finally {
      await browser.close();
   }
   return result;
}
