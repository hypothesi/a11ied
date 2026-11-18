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
   listFindings,
   type FindingRecord,
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
] as const;

export interface SubmitReceipt {
   unit: Unit;
   /** Finding ids this submission created. */
   created: string[];
   /** Finding ids this submission added an occurrence to. */
   attached: string[];
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
      getFinding(audit, finding.sameAs);
      return [];
   } catch {
      return [`${at}: sameAs "${finding.sameAs}" is not an existing finding.`];
   }
}

function checkFindings({ audit, submission }: SubmitContext): string[] {
   const scope = getConfig(audit).criteria;
   return submission.findings.flatMap((finding, index) => {
      const at = `findings[${String(index)}]`;
      const outOfScope = [finding.criterion, ...finding.alsoFails]
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
      const reported = submission.findings.some(
         (finding) =>
            finding.criterion === result.criterion ||
            finding.alsoFails.includes(result.criterion),
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

/**
 * A later occurrence can show that a known defect also fails another criterion, for
 * example when a different test pass meets it. The finding then counts against that
 * criterion too.
 */
function addRelatedCriteria(audit: Audit, findingId: string, criteria: string[]): void {
   const finding = getFinding(audit, findingId);
   const related = [...new Set([...finding.related, ...criteria])].filter(
      (criterion) => criterion !== finding.criterion,
   );
   run(
      audit,
      'UPDATE findings SET related = ? WHERE id = ?',
      JSON.stringify(related),
      findingId,
   );
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
      const candidate = {
         criterion: finding.criterion,
         related: finding.alsoFails,
         title: finding.title ?? '',
         severity: finding.severity ?? 'moderate',
         description: finding.description ?? '',
         impact: finding.impact ?? '',
         recommendation: finding.recommendation ?? '',
         source: 'agent' as const,
      };
      const existingId =
         finding.sameAs === undefined
            ? findMatchingFinding(audit, candidate)?.id
            : getFinding(audit, finding.sameAs).id;
      const findingId = existingId ?? insertFinding(audit, candidate);
      if (existingId !== undefined) {
         addRelatedCriteria(audit, existingId, [finding.criterion, ...finding.alsoFails]);
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
         ...checkFindings(context),
         ...checkDismissals(context),
         ...checkConsistency(context),
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
         dismissed: submission.dismiss.map((each) => each.finding),
      };
   });
}
