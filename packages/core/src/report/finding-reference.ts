import { createHash } from 'node:crypto';
import type { ReportFinding } from '@a11ied/contracts';

const REFERENCE_LENGTH = 12;

/** References survive report regeneration, reordering, and remediation edits. */
export function getFindingID(url: string, finding: ReportFinding): string {
   if (finding.findingID) {
      return finding.findingID;
   }
   const identity =
      finding.source === 'axe'
         ? finding.ruleId
         : (finding.evidence?.evidenceId ?? [finding.criterionIds, finding.description]);
   const digest = createHash('sha256')
      .update(JSON.stringify([url, finding.source, identity]))
      .digest('hex');

   return `F-${digest.slice(0, REFERENCE_LENGTH)}`;
}

export function addFindingReferences(
   url: string,
   findings: ReportFinding[],
): ReportFinding[] {
   function addReference(finding: ReportFinding): ReportFinding {
      return { ...finding, findingID: getFindingID(url, finding) };
   }

   return findings.map((finding) => addReference(finding));
}
