import type { CliOutputEnvelope } from '#contracts';
import { getCriterionOutcome, type CheckCriterion } from '#core';
import {
   badge,
   code,
   count,
   dim,
   indent,
   level,
   section,
   symbols,
   table,
   title,
   wrap,
} from '../lib/format.js';
import { relevanceDefinitionLines, type RenderOptions } from './shared.js';

const MAX_ELEMENTS_PER_PROBLEM = 3;
const MAX_MANUAL_CHECKS = 5;
const DETAIL_DEPTH = 2;

interface AxeNode {
   target: string[];
}

interface AxeRule {
   id: string;
   impact?: string | null;
   help: string;
   tags: string[];
   nodes: AxeNode[];
}

interface AxeSummary {
   url: string;
   violations: AxeRule[];
   passes: unknown[];
   incomplete: AxeRule[];
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

interface RelevanceAssessment {
   criterionId: string;
   title: string;
   state: string;
   reasons: string[];
}

type CriterionRollupEntry = CheckCriterion;

interface CheckVerdict {
   passed: boolean;
   failOn: string;
   failingFindings: unknown[];
   baselinedCount: number;
}

interface CheckReport {
   axe: AxeSummary;
   tree: TreeSummary;
   relevance: { assessments: Record<string, RelevanceAssessment> };
   criteria: CriterionRollupEntry[];
   verdict: CheckVerdict;
   nextCommands: string[];
}

function parseCheckReport(envelope: CliOutputEnvelope): CheckReport {
   const result = envelope.result as {
      axe: AxeSummary;
      tree: TreeSummary;
      relevance: { matrix: { assessments: Record<string, RelevanceAssessment> } };
      criteria: CriterionRollupEntry[];
      verdict: CheckVerdict;
      nextCommands: string[];
   };
   return {
      axe: result.axe,
      tree: result.tree,
      relevance: result.relevance.matrix,
      criteria: result.criteria,
      verdict: result.verdict,
      nextCommands: result.nextCommands,
   };
}

/** The axe tag for one criterion: 4.1.2 is tagged wcag412. */
function criterionTag(criterionId: string): string {
   return `wcag${criterionId.replaceAll('.', '')}`;
}

function rulesForCriterion(criterionId: string, rules: AxeRule[]): AxeRule[] {
   const tag = criterionTag(criterionId);
   return rules.filter((rule) => rule.tags.includes(tag));
}

function headlineLines(report: CheckReport): string[] {
   const { baselinedCount, failingFindings, passed } = report.verdict;
   const accepted =
      baselinedCount > 0
         ? dim(`  ${count(baselinedCount, 'finding')} accepted by the baseline.`)
         : '';

   if (passed) {
      return [`${symbols.pass} Nothing failed the automated checks.${accepted}`];
   }
   return [
      `${symbols.fail} ${count(failingFindings.length, 'problem')} to fix.${accepted}`,
   ];
}

function elementLines(rule: AxeRule): string[] {
   const shown = rule.nodes
      .slice(0, MAX_ELEMENTS_PER_PROBLEM)
      .map((node) => code(node.target.join(' ')));
   const hidden = rule.nodes.length - shown.length;
   if (hidden > 0) {
      shown.push(dim(`and ${count(hidden, 'more element')}`));
   }
   return shown;
}

function ruleLines(rule: AxeRule): string[] {
   const impact = rule.impact ? `  ${badge(rule.impact)}` : '';
   return [
      `${rule.help}${impact}`,
      dim(`${count(rule.nodes.length, 'failing element')}:`),
      ...indent(elementLines(rule)),
      `${dim('Fix it:')}  ${code(`a1 wcag rule ${rule.id}`)}`,
   ];
}

function problemLines(entry: CriterionRollupEntry, rules: AxeRule[]): string[] {
   return [
      `${code(entry.id)}  ${entry.title}  ${level(entry.level)}`,
      ...indent(
         rules.flatMap((rule) => ruleLines(rule)),
         DETAIL_DEPTH,
      ),
   ];
}

/** One block per failing criterion, each carrying the elements and the fix command. */
function renderProblemsSection(report: CheckReport): string[] {
   const failing = report.criteria.filter((entry) => entry.axeVerdict === 'fail');
   if (failing.length === 0) {
      return [];
   }

   const body = failing.flatMap((entry) =>
      problemLines(entry, rulesForCriterion(entry.id, report.axe.violations)),
   );
   return section('Problems', body);
}

function manualCriteria(report: CheckReport): CriterionRollupEntry[] {
   return report.criteria.filter(
      (entry) => entry.relevance === 'relevant' && entry.testMethod !== 'automated',
   );
}

function undecidedLines(report: CheckReport): string[] {
   if (report.axe.incomplete.length === 0) {
      return [];
   }
   const shown = report.axe.incomplete
      .slice(0, MAX_MANUAL_CHECKS)
      .map((rule) => `${symbols.bullet} ${rule.help}`);
   return [
      `${count(report.axe.incomplete.length, 'check')} could not be decided automatically:`,
      ...indent(shown),
   ];
}

function manualCriterionLines(entries: CriterionRollupEntry[]): string[] {
   if (entries.length === 0) {
      return [];
   }
   return [
      `${count(entries.length, 'criterion', 'criteria')} this page triggers need a person:`,
      ...indent(
         entries.map((entry) => `${symbols.bullet} ${code(entry.id)}  ${entry.title}`),
      ),
   ];
}

/** What automation could not settle, and the command that helps settle it. */
function renderByHandSection(report: CheckReport): string[] {
   const manual = manualCriterionLines(manualCriteria(report)),
      undecided = undecidedLines(report);
   if (undecided.length === 0 && manual.length === 0) {
      return [];
   }

   const spacer = undecided.length > 0 && manual.length > 0 ? [''] : [];
   return section('Check by hand', [
      ...undecided,
      ...spacer,
      ...manual,
      '',
      `${dim('Read the page as a screen reader does:')}  ${code(`a1 sr walk ${report.axe.url}`)}`,
      `${dim('Judge these criteria and get a report:')}  ${code(`a1 audit init ${report.axe.url} --page`)}`,
   ]);
}

/** Reads better in a sentence than "0 links". */
function countOrNone(total: number, singular: string, plural = `${singular}s`): string {
   if (total === 0) {
      return `no ${plural}`;
   }
   return count(total, singular, plural);
}

function describeCounts(tree: TreeSummary): string {
   const { counts } = tree;
   const levels = tree.headingLevels.join(', ');
   const heading = counts.headings > 0 ? ` (level ${levels})` : '';
   return [
      countOrNone(counts.landmarks, 'landmark'),
      `${countOrNone(counts.headings, 'heading')}${heading}`,
      countOrNone(counts.links, 'link'),
      countOrNone(counts.buttons, 'button'),
      countOrNone(counts.formControls, 'form control'),
   ].join(', ');
}

function renderPageSection(report: CheckReport): string[] {
   const name = report.tree.pageTitle || dim('(no title)');
   return section('The page', [
      `Titled ${name}, opening with ${report.tree.firstHeading ?? dim('no heading')}.`,
      `It has ${describeCounts(report.tree)}.`,
   ]);
}

const AXE_VERDICTS: Readonly<Record<string, string>> = {
   pass: `${symbols.pass} passed`,
   fail: `${symbols.fail} failed`,
   incomplete: `${symbols.skip} unresolved`,
   'not-covered': `${symbols.skip} ${dim('no rule')}`,
};

const APPLIES_HERE: Readonly<Record<string, string>> = {
   relevant: 'yes',
   'not-detected': dim('not seen'),
   'out-of-scope': dim('n/a'),
   unknown: 'unclear',
};

const HOW_TO_CHECK: Readonly<Record<string, string>> = {
   automated: 'scan',
   hybrid: 'scan and a person',
   manual: 'a person',
};

const TITLE_COLUMN_CAP = 46;

function rollupRow(entry: CriterionRollupEntry): string[] {
   return [
      `${code(entry.id)}  ${entry.title}`,
      level(entry.level),
      getCriterionOutcome(entry),
      AXE_VERDICTS[entry.axeVerdict] ?? entry.axeVerdict,
      APPLIES_HERE[entry.relevance] ?? entry.relevance,
      HOW_TO_CHECK[entry.testMethod] ?? entry.testMethod,
   ];
}

/** Every criterion as a table, so a reader compares columns instead of reading fields. */
function renderRollupSection(report: CheckReport, options: RenderOptions): string[] {
   if (!options.verbose) {
      return [
         '',
         dim(
            `${String(report.criteria.length)} criteria were considered. Add --verbose for every one, or --json for the full report.`,
         ),
      ];
   }
   const rows = table(
      ['Criterion', 'Level', 'Outcome', 'Scanner checks', 'Applies here', 'How to check'],
      report.criteria.map((entry) => rollupRow(entry)),
      [TITLE_COLUMN_CAP],
   );
   return [
      ...section(`Every criterion (${String(report.criteria.length)})`, rows),
      ...section('What "applies here" means', relevanceDefinitionLines()),
   ];
}

const checkSections: Array<(report: CheckReport, options: RenderOptions) => string[]> = [
   renderProblemsSection,
   renderByHandSection,
   renderPageSection,
   renderRollupSection,
];

export function renderCheckText(
   envelope: CliOutputEnvelope,
   options: RenderOptions,
): string {
   const report = parseCheckReport(envelope);
   const lines = [
      `${title('check')}  ${report.axe.url}`,
      '',
      ...wrap(headlineLines(report).join('')),
      ...checkSections.flatMap((render) => render(report, options)),
   ];
   return lines.join('\n');
}
