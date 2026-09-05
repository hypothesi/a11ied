import type { CliOutputEnvelope } from '#contracts';
import { badge, code, count, dim, fields, section, title } from '../lib/format.js';
import {
   applicabilityDefinitionLines,
   criterionLine,
   type RenderOptions,
} from './shared.js';

interface AxeSummary {
   violations: Array<{ id: string; impact?: string | null; help: string }>;
   passes: unknown[];
   incomplete: unknown[];
}

interface TreeSummary {
   pageTitle: string;
   firstHeading?: string;
   counts: {
      landmarks: number;
      headings: number;
      links: number;
      buttons: number;
      formControls: number;
   };
   headingLevels: number[];
}

interface ApplicabilityAssessment {
   criterionId: string;
   title: string;
   state: string;
   reasons: string[];
}

interface CriterionRollupEntry {
   id: string;
   title: string;
   level: string;
   axeVerdict: string;
   applicability: string;
   coverageState: string;
}

interface AuditVerdict {
   passed: boolean;
   failOn: string;
   failingFindings: unknown[];
   baselinedCount: number;
}

interface AuditReport {
   axe: AxeSummary;
   tree: TreeSummary;
   applicability: { assessments: Record<string, ApplicabilityAssessment> };
   criteria: CriterionRollupEntry[];
   verdict: AuditVerdict;
   nextCommands: string[];
}

function parseAuditReport(envelope: CliOutputEnvelope): AuditReport {
   const result = envelope.result as {
      axe: AxeSummary;
      tree: TreeSummary;
      applicability: { matrix: { assessments: Record<string, ApplicabilityAssessment> } };
      criteria: CriterionRollupEntry[];
      verdict: AuditVerdict;
      nextCommands: string[];
   };
   return {
      axe: result.axe,
      tree: result.tree,
      applicability: result.applicability.matrix,
      criteria: result.criteria,
      verdict: result.verdict,
      nextCommands: result.nextCommands,
   };
}

function renderVerdictLine(verdict: AuditVerdict): string {
   if (verdict.passed) {
      return badge('pass');
   }
   return `${badge('fail')}  ${count(verdict.failingFindings.length, 'finding')} at or above --fail-on ${verdict.failOn}`;
}

function renderAxeSection(report: AuditReport): string[] {
   const body = [
      `Violations: ${count(report.axe.violations.length, 'violation')}`,
      `Incomplete: ${count(report.axe.incomplete.length, 'incomplete check')}`,
      `Passes: ${count(report.axe.passes.length, 'pass', 'passes')}`,
      `Verdict: ${renderVerdictLine(report.verdict)}`,
      ...report.axe.violations.map(
         (violation) =>
            `${code(violation.id)}${violation.impact ? `  ${badge(violation.impact)}` : ''}  ${violation.help}`,
      ),
   ];
   return section('axe', body);
}

function renderTreeSection(report: AuditReport): string[] {
   const { counts } = report.tree;
   const body = [
      `Page title: ${report.tree.pageTitle || dim('(none)')}`,
      `First heading: ${report.tree.firstHeading ?? dim('none')}`,
      ...fields([
         ['Landmarks', String(counts.landmarks)],
         [
            'Headings',
            `${counts.headings} (levels ${report.tree.headingLevels.join(', ') || 'none'})`,
         ],
         ['Links', String(counts.links)],
         ['Buttons', String(counts.buttons)],
         ['Form controls', String(counts.formControls)],
      ]),
   ];
   return section('Accessibility tree', body);
}

function renderApplicabilitySection(
   report: AuditReport,
   options: RenderOptions,
): string[] {
   const assessments = Object.values(report.applicability.assessments);
   if (assessments.length === 0) {
      return section('Applicability', [dim('No signal-backed criteria were detected.')]);
   }
   const body = assessments.map((assessment) => {
      const line = criterionLine({ id: assessment.criterionId, title: assessment.title });
      return `${badge(assessment.state)}  ${line}`;
   });
   if (options.verbose) {
      body.push('', ...applicabilityDefinitionLines().map((line) => dim(line)));
   }
   return section('Applicability', body);
}

function needsAttention(entry: CriterionRollupEntry): boolean {
   return (
      entry.axeVerdict === 'fail' ||
      (entry.applicability === 'applicable' && entry.coverageState !== 'automated')
   );
}

function renderCriterionRow(entry: CriterionRollupEntry): string {
   const line = criterionLine({ id: entry.id, title: entry.title, level: entry.level });
   return `${line}  axe=${entry.axeVerdict}  applicability=${entry.applicability}  coverage=${entry.coverageState}`;
}

function renderCriteriaSection(report: AuditReport, options: RenderOptions): string[] {
   const rows = options.verbose
      ? report.criteria
      : report.criteria.filter(needsAttention);
   const body = rows.map((entry) => renderCriterionRow(entry));
   if (body.length === 0) {
      body.push(dim('Nothing needs attention. Add --verbose for the full rollup.'));
   } else if (!options.verbose) {
      body.push(dim('Add --verbose for the full criterion rollup.'));
   }
   return section(`Criteria (${report.criteria.length})`, body);
}

function renderNextSection(report: AuditReport): string[] {
   if (report.nextCommands.length === 0) {
      return section('Next', [dim('Nothing to follow up on.')]);
   }
   return section(
      'Next',
      report.nextCommands.map((command) => code(command)),
   );
}

const auditSections: Array<(report: AuditReport, options: RenderOptions) => string[]> = [
   renderAxeSection,
   renderTreeSection,
   renderApplicabilitySection,
   renderCriteriaSection,
   renderNextSection,
];

// Fallow-ignore-next-line unused-export
export function renderAuditText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const report = parseAuditReport(envelope);
   const lines = [
      title('audit'),
      ...auditSections.flatMap((render) => render(report, options)),
   ];
   return lines.join('\n');
}
