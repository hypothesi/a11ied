import { join } from 'node:path';
import {
   getConfig,
   getPage,
   getUnit,
   parseSubmission,
   type Audit,
   type FindingInput,
   type Submission,
} from '@a11ied/audit';
import { mapWithConcurrency } from '@a11ied/observe';
import { launchAutomationBrowser } from '../browser/runtime.js';
import { captureWithBrowser } from '../capture/runtime.js';

const CAPTURE_CONCURRENCY = 3;

interface CaptureOutcome {
   evidence: string | undefined;
   problem: string | undefined;
}

function evidencePath(unitId: string, index: number): string {
   return join('evidence', unitId, `finding-${String(index + 1)}.png`);
}

export interface CapturedSubmission {
   submission: Submission;
   /** Screenshots that could not be taken; pass them to `submitUnit` so it rejects. */
   problems: string[];
}

function addEvidence(finding: FindingInput, path: string | undefined): FindingInput {
   return path === undefined
      ? finding
      : { ...finding, evidence: [...finding.evidence, path] };
}

/** Takes each requested picture in its own browser context, a few at a time. */
async function captureAll(input: {
   unitId: string;
   auditDir: string;
   url: string;
   wanted: readonly { finding: FindingInput; index: number }[];
   storageStatePath: string | undefined;
}): Promise<CaptureOutcome[]> {
   const { browser } = await launchAutomationBrowser();
   try {
      return await mapWithConcurrency(
         input.wanted,
         CAPTURE_CONCURRENCY,
         async ({ finding, index }): Promise<CaptureOutcome> => {
            const spec = finding.screenshot;
            const relative = evidencePath(input.unitId, index);
            try {
               await captureWithBrowser(browser, input.url, {
                  out: join(input.auditDir, relative),
                  selector: spec?.selector,
                  viewport: spec?.viewport,
                  zoom: spec?.zoom,
                  textSpacing: spec?.textSpacing,
                  click: spec?.click,
                  press: spec?.press,
                  hover: spec?.hover,
                  storageStatePath: input.storageStatePath,
               });
               return { evidence: relative, problem: undefined };
            } catch (error) {
               const reason = error instanceof Error ? error.message : String(error);
               return {
                  evidence: undefined,
                  problem: `findings[${String(index)}].screenshot: could not take it: ${reason}`,
               };
            }
         },
      );
   } finally {
      await browser.close();
   }
}

/**
 * Takes the screenshot each finding asks for and adds it to that finding's evidence, so a
 * worker names the element and its state instead of producing the image. A screenshot
 * that cannot be taken comes back as a problem, to be reported with every other one.
 */
export async function captureSubmissionEvidence(
   audit: Audit,
   input: { unitId: string; submission: unknown; storageStatePath?: string | undefined },
): Promise<CapturedSubmission> {
   const submission = parseSubmission(input.submission);
   const page = getPage(audit, getUnit(audit, input.unitId).pageId);
   const wanted = submission.findings
      .map((finding, index) => ({ finding, index }))
      .filter(({ finding }) => finding.screenshot !== undefined);
   const isWebPage =
      getConfig(audit).platform === 'web' && /^https?:\/\//u.test(page.locator);
   if (!isWebPage || wanted.length === 0) {
      return { submission, problems: [] };
   }
   const outcomes = await captureAll({
      unitId: input.unitId,
      auditDir: audit.dir,
      url: page.locator,
      wanted,
      storageStatePath: input.storageStatePath,
   });
   const problems = outcomes.flatMap((outcome) =>
      outcome.problem === undefined ? [] : [outcome.problem],
   );
   const added = new Map(
      wanted.map(({ index }, position) => [index, outcomes[position]?.evidence]),
   );
   return {
      problems,
      submission: {
         ...submission,
         findings: submission.findings.map((finding, index) =>
            addEvidence(finding, added.get(index)),
         ),
      },
   };
}
