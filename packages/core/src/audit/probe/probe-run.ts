import { listEvidenceStateReferences } from '../../evidence/state-references.js';
import type {
   AssessmentCheck,
   AssessmentEvidenceKind,
   AssessmentProcedure,
   AuditRun,
   EvidenceOutcome,
} from '@a11ied/contracts';
import type { Browser } from 'playwright';
import { launchAutomationBrowser } from '../../browser/runtime.js';
import { executeAuditAssessment } from '../assessment-command.js';
import { nextAuditAssessment } from '../run-lifecycle.js';
import { readAuditRun, withRunTransaction } from '../run-store.js';
import {
   getMissingCapabilities,
   getRequiredEvidence,
} from '../../evidence/procedure-requirements.js';
import { observeStateMedia } from './probe-media.js';
import { buildRecord } from './probe-record.js';
import { judgeCriterion } from './judge.js';
import { observeInventoryPages } from './probe-observe.js';
import { writeProbeArtifacts, type PageJudgement } from './probe-artifacts.js';
import { buildSiteFacts, PageEvidenceCache } from './probe-site.js';
import type { Judgement, SiteFacts } from './probe-types.js';

const MAX_RECOVERY_ROUNDS = 3;
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

interface Claim {
   check: AssessmentCheck;
   procedure: AssessmentProcedure;
}

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

async function judgePages(
   context: RunContext,
   claim: Claim,
   states: AuditRun['states'],
): Promise<PageJudgement[]> {
   return Promise.all(
      states.map(async (state) => {
         if (claim.procedure.inapplicability?.kind === 'media-absence') {
            return observeStateMedia(context.browser, state);
         }
         const { facts, axe } = await context.cache.get(state.target.value);
         return {
            url: state.target.value,
            mediaInventory: facts.mediaInventory,
            facts,
            judgement: judgeCriterion(claim.check.criterionId, {
               facts,
               axe,
               site: context.site,
            }),
         };
      }),
   );
}

async function blockUnavailableCheck(input: {
   file: string;
   run: AuditRun;
   claim: Claim;
   folded: Judgement;
}): Promise<boolean> {
   const { file, run, claim, folded } = input;
   const { check, procedure } = claim;
   const environment = run.environments.find(
      (entry) => entry.environmentId === check.environmentId,
   );
   const missing = getMissingCapabilities({
      procedure,
      capabilities: environment?.capabilities ?? [],
      isInapplicable: folded.outcome === 'inapplicable',
   });
   if (missing.length > 0) {
      await executeAuditAssessment({
         action: 'block',
         file,
         checkId: check.checkId,
         reason: `${folded.rationale} Required capabilities are unavailable: ${missing.join(', ')}.`,
      });
      return true;
   }
   return false;
}

async function runClaim(context: RunContext, claim: Claim): Promise<EvidenceOutcome> {
   const { check, procedure } = claim;
   const run = await readAuditRun(context.file);
   const states = statesForCheck(run, check);
   const pages = await judgePages(context, claim, states);
   const folded = foldJudgements(pages);
   if (await blockUnavailableCheck({ file: context.file, run, claim, folded })) {
      return 'cantTell';
   }
   const kinds = [
      ...new Set<AssessmentEvidenceKind>([
         'observation',
         'action-trace',
         ...getRequiredEvidence(procedure, folded.outcome === 'inapplicable'),
      ]),
   ];
   const artifacts = await writeProbeArtifacts({
      runFile: context.file,
      runId: run.runId,
      checkId: check.checkId,
      attempt: check.attempts,
      environmentId: check.environmentId,
      kinds,
      states: listEvidenceStateReferences(states),
      pages,
      rationale: folded.rationale,
      captureScreenshot: (url) => captureScreenshot(context.browser, url),
   });
   await withRunTransaction(context.file, async (tx) => {
      await tx.registerStateArtifacts(
         listEvidenceStateReferences(states),
         artifacts.map((artifact) => artifact.path),
      );
      const currentRun = tx.readRun();
      const refreshed = statesForCheck(currentRun, check);
      const { record } = await tx.recordEvidence(
         buildRecord({
            run: currentRun,
            check,
            procedure,
            folded,
            states: refreshed,
            artifacts,
         }),
         { wcagVersion: currentRun.profile.wcagVersion },
      );
      await tx.evaluateCheck({
         checkId: check.checkId,
         outcome: folded.outcome,
         evidenceIds: [record.evidenceId ?? ''],
      });
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
   if (run.activeCheckIds.length > 0) {
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
      const batch = await nextAuditAssessment(context.file, {
         excludeCapabilities: ['screen-reader', 'real-reader', 'speech'],
         scopes: ['state', 'element', 'component'],
      });
      const check = batch.checks?.[0],
         procedure = batch.procedures?.[0];
      if (!check || !procedure) {
         return;
      }
      // oxlint-disable-next-line no-await-in-loop -- the claim must finish before the next
      const outcome = await runClaim(context, { check, procedure });
      result.attempted += 1;
      result.outcomes[outcome] += 1;
      options.onProgress?.(`${check.criterionId} ${outcome}`);
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
      if (options.limit !== undefined && result.attempted >= options.limit) {
         return;
      }
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
