import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { z } from 'zod';
import { addEvent, getConfig, run, transact, type Audit } from './db.js';
import { AuditError } from './errors.js';
import {
   dismissOnPage,
   failsCriterion,
   findMatchingFinding,
   getFinding,
   insertFinding,
   insertInstance,
   isAwaitingDescription,
   listFindings,
   rewriteFinding,
   type FindingRecord,
   type NewFinding,
} from './findings.js';
import {
   submissionSchema,
   type FindingInput,
   type Submission,
   type Unit,
} from './schema.js';
import { SITE_PAGE_ID } from './pages.js';
import { checkStates, storeStates } from './states.js';
import { assertHeldBy, getUnit } from './units.js';

const NEW_FINDING_FIELDS = [
   'title',
   'severity',
   'description',
   'impact',
   'recommendation',
   'reason',
] as const;

/** A page id, such as P12, named in a note. */
const PAGE_REFERENCE = /\bP\d+\b/gu;

export interface SubmitReceipt {
   unit: Unit;
   /** Finding ids this submission created. */
   created: string[];
   /** Finding ids this submission added an occurrence to. */
   attached: string[];
   /** Automated finding ids this submission described in the worker's own words. */
   confirmed: string[];
   dismissed: string[];
}

function describeIssue(issue: z.core.$ZodIssue): string {
   const path = issue.path.map(String).join('.');
   return path === '' ? issue.message : `${path}: ${issue.message}`;
}

/** Parses a submission and reports every schema problem at once. */
export function parseSubmission(input: unknown): Submission {
   const parsed = submissionSchema.safeParse(input);
   if (parsed.success) {
      return parsed.data;
   }
   const problems = parsed.error.issues.map(describeIssue);
   throw new AuditError(
      'invalid-submission',
      'The submission does not match the expected shape.',
      problems,
   );
}

/** Everything the checks and writes for one submission need. */
interface SubmitContext {
   audit: Audit;
   unit: Unit;
   worker: string;
   submission: Submission;
   /** Findings with an open occurrence on the unit's page before this submission. */
   openOnPage: FindingRecord[];
}

function checkCoverage({ unit, submission }: SubmitContext): string[] {
   const submitted = submission.results.map((result) => result.criterion);
   const missing = unit.criteria.filter((criterion) => !submitted.includes(criterion));
   const extra = submitted.filter((criterion) => !unit.criteria.includes(criterion));
   const duplicated = submitted.filter(
      (criterion, index) => submitted.indexOf(criterion) !== index,
   );
   return [
      ...missing.map(
         (criterion) =>
            `results: ${criterion} has no outcome. Every criterion in the unit needs one; use cannot-tell with the reason when you could not check it.`,
      ),
      ...extra.map(
         (criterion) =>
            `results: ${criterion} is not part of ${unit.id}. Remove it. A defect against another criterion goes in findings.`,
      ),
      ...duplicated.map((criterion) => `results: ${criterion} appears more than once.`),
   ];
}

function checkSameAs(audit: Audit, finding: FindingInput, at: string): string[] {
   if (finding.sameAs === undefined) {
      const absent = NEW_FINDING_FIELDS.filter((field) => !finding[field]);
      return absent.length === 0
         ? []
         : [
              `${at}: a new finding needs ${absent.join(', ')}. To add an occurrence of an existing finding, set sameAs to its id instead.`,
           ];
   }
   try {
      const known = getFinding(audit, finding.sameAs);
      const isNewCriterion = !failsCriterion(known, finding.criterion);
      return isNewCriterion && !finding.reason
         ? [
              `${at}: ${known.id} is not yet recorded against ${finding.criterion}. Add reason: what ${finding.criterion} requires and what the page does instead.`,
           ]
         : [];
   } catch {
      return [`${at}: sameAs "${finding.sameAs}" is not an existing finding.`];
   }
}

function listFailedCriteria(finding: FindingInput): string[] {
   return [finding.criterion, ...finding.alsoFails.map((each) => each.criterion)];
}

function checkFindings({ audit, submission }: SubmitContext): string[] {
   const scope = getConfig(audit).criteria;
   return submission.findings.flatMap((finding, index) => {
      const at = `findings[${String(index)}]`;
      const outOfScope = listFailedCriteria(finding)
         .filter((criterion) => !scope.includes(criterion))
         .map(
            (criterion) =>
               `${at}: ${criterion} is outside this audit's scope. Leave it out or mention it in the summary.`,
         );
      const missingEvidence = finding.evidence
         .filter((path) => !existsSync(resolve(audit.dir, path)))
         .map(
            (path) =>
               `${at}: evidence file "${path}" does not exist. Save it under ${resolve(audit.dir, 'evidence')} or remove the reference.`,
         );
      return [...outOfScope, ...checkSameAs(audit, finding, at), ...missingEvidence];
   });
}

/**
 * On a web page, every occurrence needs a picture a reader can check: a screenshot spec,
 * which the submit command turns into a cropped image of the element, or a saved image.
 */
function checkVisualEvidence({ audit, unit, submission }: SubmitContext): string[] {
   if (getConfig(audit).platform !== 'web' || unit.pageId === SITE_PAGE_ID) {
      return [];
   }
   // A screenshot spec that could not be taken is reported by the caller that tried.
   return submission.findings.flatMap((finding, index) =>
      finding.evidence.length > 0 || finding.screenshot !== undefined
         ? []
         : [
              `findings[${String(index)}]: no evidence. Add screenshot: {"selector": "..."} with any viewport, click, press, or hover needed to show the defect, and a1 audit submit saves a cropped picture of the element. Or save an image under evidence/${unit.id}/ and list it.`,
           ],
   );
}

/**
 * A note is read on its own, next to one criterion on one page. One that points at
 * another page makes the reader look elsewhere and is not an observation of this page.
 */
function checkNotes({ unit, submission }: SubmitContext): string[] {
   if (unit.pageId === SITE_PAGE_ID) {
      return [];
   }
   return submission.results.flatMap((result) => {
      const others = [...new Set(result.note.match(PAGE_REFERENCE))].filter(
         (pageId) => pageId !== unit.pageId,
      );
      return others.length === 0
         ? []
         : [
              `results: the note for ${result.criterion} refers to ${others.join(', ')}. Say what you tested and observed on ${unit.pageId} so the note stands alone.`,
           ];
   });
}

/** The finding ids a list of confirmations or dismissals names, in lower case. */
function collectFindingIds(list: readonly { finding: string }[]): Set<string> {
   return new Set(list.map((each) => each.finding.toLowerCase()));
}

/**
 * An automated finding says what a rule checks, not what is wrong on the page. The worker
 * who decides its criterion on a page either describes it from what it saw or dismisses
 * it, so no finding reaches the report in the scanner's words.
 */
function checkConfirmations({ unit, submission, openOnPage }: SubmitContext): string[] {
   const confirmed = collectFindingIds(submission.confirm);
   const dismissed = collectFindingIds(submission.dismiss);
   const automated = openOnPage.filter((finding) => finding.source === 'axe');
   const unknown = submission.confirm
      .filter(
         (each) =>
            !automated.some(
               (finding) => finding.id.toLowerCase() === each.finding.toLowerCase(),
            ),
      )
      .map(
         (each) =>
            `confirm: ${each.finding} is not an automated finding open on ${unit.pageId}. Use confirm only for those; report anything else in findings.`,
      );
   const both = submission.confirm
      .filter((each) => dismissed.has(each.finding.toLowerCase()))
      .map((each) => `confirm: ${each.finding} is also in dismiss. Choose one.`);
   const undescribed = automated
      .filter(
         (finding) =>
            isAwaitingDescription(finding) &&
            unit.criteria.includes(finding.criterion) &&
            !confirmed.has(finding.id.toLowerCase()) &&
            !dismissed.has(finding.id.toLowerCase()),
      )
      .map(
         (finding) =>
            `confirm: ${finding.id} is an automated finding on this page that still has the scanner's wording. If it is real, add {"finding": "${finding.id}", "title", "description", "impact", "recommendation", "reason"} to confirm, written from what you observed. If it is wrong, add it to dismiss.`,
      );
   return [...unknown, ...both, ...undescribed];
}

function checkDismissals({ unit, submission, openOnPage }: SubmitContext): string[] {
   return submission.dismiss
      .filter(
         (dismissal) =>
            !openOnPage.some(
               (finding) => finding.id.toLowerCase() === dismissal.finding.toLowerCase(),
            ),
      )
      .map(
         (dismissal) =>
            `dismiss: ${dismissal.finding} has no open occurrence on ${unit.pageId}.`,
      );
}

/**
 * An outcome must agree with the findings left open on the page: fail needs one, and pass
 * or not-applicable cannot coexist with one.
 */
function checkConsistency({ unit, submission, openOnPage }: SubmitContext): string[] {
   const dismissed = new Set(
      submission.dismiss.map((each) => each.finding.toLowerCase()),
   );
   return submission.results.flatMap((result) => {
      const stillOpen = openOnPage
         .filter(
            (finding) =>
               failsCriterion(finding, result.criterion) &&
               !dismissed.has(finding.id.toLowerCase()),
         )
         .map((finding) => finding.id);
      const reported = submission.findings.some((finding) =>
         listFailedCriteria(finding).includes(result.criterion),
      );
      const hasFinding = reported || stillOpen.length > 0;
      if (result.outcome === 'fail' && !hasFinding) {
         return [
            `results: ${result.criterion} is fail but no finding describes the failure on ${unit.pageId}. Add one to findings.`,
         ];
      }
      const claimsClean =
         result.outcome === 'pass' || result.outcome === 'not-applicable';
      if (claimsClean && hasFinding) {
         const cause = reported
            ? 'this submission reports a finding for it'
            : `${stillOpen.join(', ')} is open on this page`;
         return [
            `results: ${result.criterion} is ${result.outcome} but ${cause}. Record fail, or dismiss the finding with a reason if it is wrong.`,
         ];
      }
      return [];
   });
}

function storeEvidencePath(audit: Audit, path: string): string {
   const absolute = resolve(audit.dir, path);
   const inside = relative(audit.dir, absolute);
   return inside.startsWith('..') || isAbsolute(inside) ? absolute : inside;
}

/** The reason a submitted finding gives for each criterion it fails. */
function collectReasons(finding: FindingInput): Record<string, string> {
   return Object.fromEntries([
      ...(finding.reason ? [[finding.criterion, finding.reason]] : []),
      ...finding.alsoFails.map((each) => [each.criterion, each.reason]),
   ]);
}

/**
 * A later occurrence can show that a known defect also fails another criterion, for
 * example when a different test pass meets it. The finding then counts against that
 * criterion too. A reason already recorded for a criterion is kept.
 */
function addRelatedCriteria(audit: Audit, findingId: string, input: FindingInput): void {
   const finding = getFinding(audit, findingId);
   const related = [
      ...new Set([...finding.related, ...listFailedCriteria(input)]),
   ].filter((criterion) => criterion !== finding.criterion);
   run(
      audit,
      'UPDATE findings SET related = ?, reasons = ? WHERE id = ?',
      JSON.stringify(related),
      JSON.stringify({ ...collectReasons(input), ...finding.reasons }),
      findingId,
   );
}

/**
 * Replaces the scanner's wording on each confirmed automated finding. A finding another
 * worker already described keeps that description.
 */
function applyConfirmations({ audit, worker, submission }: SubmitContext): string[] {
   return submission.confirm.flatMap((confirmation) => {
      const finding = getFinding(audit, confirmation.finding);
      if (!isAwaitingDescription(finding)) {
         return [];
      }
      rewriteFinding(audit, {
         findingId: finding.id,
         actor: worker,
         changes: {
            title: confirmation.title,
            severity: confirmation.severity ?? finding.severity,
            description: confirmation.description,
            impact: confirmation.impact,
            recommendation: confirmation.recommendation,
            reasons: { [finding.criterion]: confirmation.reason },
         },
      });
      return [finding.id];
   });
}

function toNewFinding(finding: FindingInput): NewFinding {
   return {
      criterion: finding.criterion,
      related: finding.alsoFails.map((each) => each.criterion),
      reasons: collectReasons(finding),
      title: finding.title ?? '',
      severity: finding.severity ?? 'moderate',
      description: finding.description ?? '',
      impact: finding.impact ?? '',
      recommendation: finding.recommendation ?? '',
      source: 'agent',
   };
}

function applyFindings({
   audit,
   unit,
   worker,
   submission,
}: SubmitContext): Pick<SubmitReceipt, 'created' | 'attached'> {
   const created: string[] = [];
   const attached: string[] = [];
   for (const finding of submission.findings) {
      const candidate = toNewFinding(finding);
      const existingId =
         finding.sameAs === undefined
            ? findMatchingFinding(audit, candidate)?.id
            : getFinding(audit, finding.sameAs).id;
      const findingId = existingId ?? insertFinding(audit, candidate);
      if (existingId !== undefined) {
         addRelatedCriteria(audit, existingId, finding);
      }
      (existingId === undefined ? created : attached).push(findingId);
      insertInstance(audit, {
         findingId,
         pageId: unit.pageId,
         unitId: unit.id,
         location: finding.location,
         detail: finding.detail ?? '',
         evidence: finding.evidence.map((path) => storeEvidencePath(audit, path)),
         worker,
      });
   }
   return { created: [...new Set(created)], attached: [...new Set(attached)] };
}

function applyResults({ audit, unit, worker, submission }: SubmitContext): void {
   const recordedAt = audit.now().toISOString();
   for (const result of submission.results) {
      run(
         audit,
         'INSERT INTO results (pageId, criterion, outcome, note, unitId, worker, recordedAt) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (pageId, criterion) DO UPDATE SET outcome = excluded.outcome, note = excluded.note, unitId = excluded.unitId, worker = excluded.worker, recordedAt = excluded.recordedAt',
         unit.pageId,
         result.criterion,
         result.outcome,
         result.note,
         unit.id,
         worker,
         recordedAt,
      );
   }
   run(
      audit,
      "UPDATE units SET status = 'done', leaseExpiresAt = NULL, finishedAt = ?, summary = ?, reason = '' WHERE id = ?",
      recordedAt,
      submission.summary,
      unit.id,
   );
}

function summarize({ unit, submission }: SubmitContext): string {
   const counts = new Map<string, number>();
   for (const result of submission.results) {
      counts.set(result.outcome, (counts.get(result.outcome) ?? 0) + 1);
   }
   const tally = [...counts.entries()]
      .map(([outcome, count]) => `${String(count)} ${outcome}`)
      .join(', ');
   const suffix = submission.summary === '' ? '' : ` - ${submission.summary}`;
   return `Finished ${unit.id}: ${tally}; ${String(submission.findings.length)} finding(s)${suffix}`;
}

/**
 * Accepts a worker's results for a unit, or rejects them with every problem listed.
 * Nothing is stored unless the whole submission is valid.
 */
export function submitUnit(
   audit: Audit,
   input: {
      unitId: string;
      worker: string;
      submission: unknown;
      /** Problems found before this call, such as screenshots that could not be taken. */
      problems?: readonly string[] | undefined;
   },
): SubmitReceipt {
   const submission = parseSubmission(input.submission);
   return transact(audit, () => {
      const unit = getUnit(audit, input.unitId);
      assertHeldBy(unit, input.worker);
      const context: SubmitContext = {
         audit,
         unit,
         worker: input.worker,
         submission,
         openOnPage: listFindings(audit, { pageId: unit.pageId }),
      };
      const problems = [
         ...(input.problems ?? []),
         ...checkCoverage(context),
         ...checkNotes(context),
         ...checkFindings(context),
         ...checkDismissals(context),
         ...checkConsistency(context),
         ...checkConfirmations(context),
         ...checkVisualEvidence(context),
         ...checkStates(audit, unit, submission.states),
      ];
      if (problems.length > 0) {
         throw new AuditError(
            'submission-rejected',
            `Nothing was saved. Fix ${String(problems.length)} problem(s) and submit ${unit.id} again.`,
            problems,
         );
      }
      for (const dismissal of submission.dismiss) {
         dismissOnPage(audit, {
            findingId: getFinding(audit, dismissal.finding).id,
            pageId: unit.pageId,
            reason: dismissal.reason,
         });
      }
      const confirmed = applyConfirmations(context);
      const applied = applyFindings(context);
      applyResults(context);
      storeStates(audit, unit, submission.states);
      addEvent(audit, {
         actor: input.worker,
         type: 'unit-done',
         unitId: unit.id,
         message: summarize(context),
      });
      return {
         unit: getUnit(audit, unit.id),
         ...applied,
         confirmed,
         dismissed: submission.dismiss.map((each) => each.finding),
      };
   });
}
