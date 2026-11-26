import type { Finding, Severity } from '../schema.js';
import type { CriterionStanding } from '../status.js';
import type { AuditReport, ReportFinding } from './model.js';

const DATE_LENGTH = 10;

export const STANDING_LABELS: Readonly<Record<CriterionStanding, string>> = {
   fail: 'Fails',
   pass: 'Passes',
   'not-applicable': 'Not applicable',
   'cannot-tell': 'Not verified',
   pending: 'In progress',
   'not-evaluated': 'Not evaluated',
};

export const SEVERITY_LABELS: Readonly<Record<Severity, string>> = {
   critical: 'Critical',
   serious: 'Serious',
   moderate: 'Moderate',
   minor: 'Minor',
};

export const SEVERITY_MEANINGS: Readonly<Record<Severity, string>> = {
   critical: 'Blocks some people from completing a task. Fix first.',
   serious: 'Makes a task very difficult or unreliable for some people.',
   moderate: 'Causes friction or confusion but has a workaround.',
   minor: 'A small barrier or deviation with limited effect.',
};

export function formatDate(iso: string): string {
   return iso.slice(0, DATE_LENGTH);
}

export function describeStandard(report: AuditReport): string {
   const { config } = report;
   const all = report.criteria.length;
   return `WCAG ${config.wcagVersion} Level ${config.level} (${String(all)} success ${all === 1 ? 'criterion' : 'criteria'} in scope)`;
}

export function plural(count: number, one: string, many: string): string {
   return `${String(count)} ${count === 1 ? one : many}`;
}

/** States the result of the audit in one or two sentences. */
export function describeVerdict(report: AuditReport): string {
   const { criteria, findings, units } = report.status;
   const standard = `WCAG ${report.config.wcagVersion} Level ${report.config.level}`;
   const progress = report.final
      ? ''
      : ` This is an interim result: ${String(units.percentDone)}% of the planned checks are complete.`;
   if (report.verdict === 'fails') {
      return `${report.config.name} does not meet ${standard}. ${plural(criteria.fail, 'success criterion fails', 'success criteria fail')}, described in ${plural(findings.total, 'finding', 'findings')}.${progress}`;
   }
   if (report.verdict === 'no-failures') {
      return `No failures of ${standard} were found in the audited scope. Conformance applies only to the pages, states, and criteria listed in this report.`;
   }
   const undecided =
      criteria.pending + criteria['cannot-tell'] + criteria['not-evaluated'];
   return `No failures have been found so far, but ${plural(undecided, 'success criterion is', 'success criteria are')} not yet decided, so this audit cannot state conformance.${progress}`;
}

export function describeScope(report: AuditReport): string {
   const kind = report.config.platform === 'web' ? 'page' : 'screen';
   return `${plural(report.pages.length, `${kind} or state`, `${kind}s and states`)} of ${report.config.target}`;
}

export const METHOD_PARAGRAPHS: readonly string[] = [
   'Each page or screen was tested in passes that group related success criteria: names and structure as assistive technology receives them, keyboard operation, visual presentation, media and motion, forms, and pointer input. Checks that compare pages were run once across the whole set.',
   'An automated scan (axe-core and page measurements) ran first. A failure the scanner is certain of is reported directly. Scanner output is never used to pass a criterion: every pass, not-applicable, and remaining failure was decided by an auditing agent that operated the page and inspected the result.',
   'Each page was judged in every state it can reach that the auditor found, such as open menus, dialogs, and forms showing errors; the scan lists the controls that open them so none is skipped by accident. The scope table names the states tested. A state left untested appears under "Not verified".',
   'A criterion fails when at least one audited page or screen fails it. "Not verified" marks checks that could not be completed, with the reason. Results apply to the audited scope on the audit dates and do not cover pages, states, or content outside it.',
];

export function describeSource(source: Finding['source']): string {
   return source === 'axe' ? 'Found by automated scan' : 'Found by an auditing agent';
}

export interface ExclusionGroup {
   reason: string;
   names: string[];
}

/** Groups excluded pages by reason, so a reason shared by many pages is stated once. */
export function groupExclusions(report: AuditReport): ExclusionGroup[] {
   const groups = new Map<string, string[]>();
   for (const page of report.excluded) {
      groups.set(page.excludeReason, [
         ...(groups.get(page.excludeReason) ?? []),
         page.name,
      ]);
   }
   return [...groups].map(([reason, names]) => ({ reason, names }));
}

/** The criterion a finding fails, with any others it also fails, for a table cell. */
export function describeCriteria(finding: ReportFinding): string {
   const also =
      finding.alsoFails.length === 0
         ? ''
         : `, also ${finding.alsoFails.map((each) => each.id).join(', ')}`;
   return `${finding.criterion.id} ${finding.criterion.title}${also}`;
}
