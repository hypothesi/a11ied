import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
   cliOutputEnvelopeSchema,
   type AuditRun,
   type EvidenceRecord,
   type SiteInventory,
} from '@a11ied/contracts';
import {
   auditReportSchema,
   rebuildAuditAssessment,
   type AuditReport,
} from '../audit/runtime.js';
import { readAuditRun } from '../audit/run-store.js';
import { stripFragment } from '../evidence/subject.js';
import { readEvidence } from '../evidence/store.js';
import type { AuditAssessmentSnapshot } from '../audit/run-status.js';
import {
   buildCriteriaRollup,
   type AuditCriterionRollup,
} from '../audit/criteria-rollup.js';
import { getCheckEvidenceError } from '../audit/check-evidence.js';
import { isVerifiedEvidence } from '../evidence/validation.js';
import { isPageDocumentMatched } from '../audit/run-scope.js';

export interface LoadedPageAudit {
   pageId: string;
   subject?: string;
   report?: AuditReport | undefined;
   error?: string | undefined;
   assessmentError?: string | undefined;
   assessmentProfile?: AuditRun['profile'] | undefined;
   recorded?: EvidenceRecord[];
   criteria?: AuditCriterionRollup[];
}

function getReportRecord(
   record: EvidenceRecord,
   assessment: AuditAssessmentSnapshot,
): EvidenceRecord {
   if (!isVerifiedEvidence(record)) {
      return record;
   }
   const check = assessment.status.run.checks.find(
      (entry) => entry.checkId === record.provenance?.checkId,
   );
   const reason =
      check?.status === 'evaluated' && check.evidenceIds.includes(record.evidenceId ?? '')
         ? getCheckEvidenceError({ check, records: assessment.records })
         : 'The recorded judgment has not been accepted by an evaluated check.';
   if (!reason) {
      return record;
   }
   return { ...record, verification: { status: 'unverified', reasons: [reason] } };
}

function isPageRecord(input: {
   record: EvidenceRecord;
   page: SiteInventory['pages'][number];
   assessment?: AuditAssessmentSnapshot;
}): boolean {
   const { record, page, assessment } = input;
   if (!assessment) {
      return record.subject === stripFragment(page.finalUrl);
   }
   const run = assessment.status.run;
   const check = run.checks.find((entry) => entry.checkId === record.provenance?.checkId);
   return (
      check?.scope === 'site' ||
      run.states.some(
         (state) =>
            record.provenance?.states.some(
               (reference) => reference.stateId === state.stateId,
            ) && isPageDocumentMatched(state.target, page),
      )
   );
}

function assertScanIdentity(
   report: AuditReport,
   page: SiteInventory['pages'][number],
   profile: AuditRun['profile'] | undefined,
): void {
   if (stripFragment(report.axe.url) !== stripFragment(page.finalUrl)) {
      throw new Error('The saved scan belongs to another page.');
   }
   if (
      profile &&
      (report.axe.wcagVersion !== profile.wcagVersion ||
         (report.axe.selection.kind === 'level' &&
            report.axe.selection.level !== profile.level))
   ) {
      throw new Error(
         'The saved scan uses a different WCAG version or conformance level.',
      );
   }
}

async function loadSavedAudit(input: {
   page: SiteInventory['pages'][number];
   resultsDir: string;
   profile?: AuditRun['profile'] | undefined;
}): Promise<LoadedPageAudit> {
   const { page, resultsDir, profile } = input;
   try {
      const envelope = cliOutputEnvelopeSchema.parse(
         JSON.parse(
            await readFile(resolve(resultsDir, page.pageId, 'audit.json'), 'utf8'),
         ),
      );
      const report = auditReportSchema.parse(envelope.result);
      assertScanIdentity(report, page, profile);
      return { pageId: page.pageId, report, assessmentProfile: profile };
   } catch (error) {
      return {
         pageId: page.pageId,
         error: error instanceof Error ? error.message : String(error),
      };
   }
}

async function readAssessmentProfile(
   inventory: SiteInventory,
): Promise<AuditRun['profile'] | undefined> {
   if (!inventory.run.assessmentFile) {
      return inventory.run.profile;
   }
   const run = await readAuditRun(resolve(inventory.run.assessmentFile));
   if (
      run.runId !== inventory.run.runId ||
      run.target.value !== inventory.startUrl ||
      run.scope !== inventory.run.scope ||
      (inventory.run.profile &&
         JSON.stringify(run.profile) !== JSON.stringify(inventory.run.profile))
   ) {
      throw new Error(
         'The inventory and assessment run have different identities or profiles.',
      );
   }
   return run.profile;
}

async function loadCurrentJudgments(input: {
   inventory: SiteInventory;
   resultsDir: string;
   reports: LoadedPageAudit[];
   assessment?: AuditAssessmentSnapshot;
}): Promise<LoadedPageAudit[]> {
   const { inventory, resultsDir, reports } = input;
   const runFile = resolve(
      inventory.run.assessmentFile ?? resolve(resultsDir, '..', 'run.json'),
   );
   const records =
      input.assessment?.records ??
      (await readEvidence({
         file: resolve(dirname(runFile), 'evidence.jsonl'),
         runFile,
         expectedRunId: inventory.run.runId,
      }));
   return reports.map((entry) => {
      const page = inventory.pages.find((candidate) => candidate.pageId === entry.pageId);
      if (!page) {
         throw new Error('The report page is missing from the scoped inventory.');
      }
      const recorded = records
         .filter((record) =>
            isPageRecord({
               record,
               page,
               ...(input.assessment ? { assessment: input.assessment } : {}),
            }),
         )
         .map((record) =>
            input.assessment ? getReportRecord(record, input.assessment) : record,
         );
      entry.recorded = recorded;
      entry.subject = page.finalUrl;
      if (entry.report) {
         entry.report = rebuildAuditAssessment(
            { ...entry.report, recorded },
            entry.assessmentProfile,
         );
         entry.criteria = entry.report.criteria;
      } else if (entry.assessmentProfile) {
         entry.criteria = buildCriteriaRollup({
            version: entry.assessmentProfile.wcagVersion,
            level: entry.assessmentProfile.level,
            relevanceStates: {},
            recorded,
         });
      }
      return entry;
   });
}

/** Load validated scans and revalidate all judgments against one current run snapshot. */
export async function loadPageAuditReports(
   inventory: SiteInventory,
   resultsDir: string,
   options: { draft?: boolean | undefined; assessment?: AuditAssessmentSnapshot } = {},
): Promise<LoadedPageAudit[]> {
   const { draft = false, assessment } = options;
   const pages = inventory.pages.filter(
      (page) =>
         !page.isDuplicateOf &&
         page.auditStatus !== 'skipped-duplicate' &&
         (assessment !== undefined ||
            page.auditStatus === 'audited' ||
            page.auditStatus === 'error' ||
            (draft && page.auditStatus === 'in-progress')),
   );
   let profile = inventory.run.profile;
   let profileError: string | undefined = undefined;
   try {
      profile =
         assessment?.status.run.profile ?? (await readAssessmentProfile(inventory));
   } catch (error) {
      profileError = error instanceof Error ? error.message : String(error);
   }
   const reports = await Promise.all(
      pages.map((page) => loadSavedAudit({ page, resultsDir, profile })),
   );
   for (const entry of reports) {
      entry.assessmentProfile = profile;
   }
   try {
      const current = await loadCurrentJudgments({
         inventory,
         resultsDir,
         reports,
         ...(assessment ? { assessment } : {}),
      });
      return profileError
         ? current.map((entry) => ({
              ...entry,
              error: entry.error ?? profileError,
              assessmentError: profileError,
           }))
         : current;
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reports.map((entry) => {
         entry.error ??= message;
         entry.assessmentError = profileError ?? message;
         if (entry.report) {
            entry.report = rebuildAuditAssessment(
               { ...entry.report, recorded: [] },
               profile,
            );
         }
         return entry;
      });
   }
}
