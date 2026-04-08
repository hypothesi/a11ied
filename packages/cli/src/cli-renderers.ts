import type { CliOutputEnvelope, InteractionPatternResult } from '@a11lied/contracts';
import { stripHtml } from './cli-execute.js';

export function renderWcagLevelsText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as { version: string; levels: string[] };
   return [`WCAG ${result.version}`, `Levels: ${result.levels.join(', ')}`].join('\n');
}

export function renderCriteriaText(
   envelope: CliOutputEnvelope,
   _options: { verbose: boolean },
): string {
   const result = envelope.result as {
      version: string;
      level: string;
      criteria: Array<{ id: string; title: string }>;
   };
   const lines = [`WCAG ${result.version} ${result.level}`, ''];

   for (const criterion of result.criteria) {
      lines.push(`${criterion.id}  ${criterion.title}`);
   }

   return lines.join('\n');
}

export function renderShowCriterionText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      criterion: {
         id: string;
         slug?: string;
         title: string;
         level: string;
         wcagVersion?: string;
         summary: string;
         normativeText: string;
         understandingUrl: string;
         tags?: string[];
      };
   };

   const lines = [
      `${result.criterion.id}  ${result.criterion.title} [${result.criterion.level}]`,
      '',
      result.criterion.summary,
      '',
      `Normative text: ${stripHtml(result.criterion.normativeText)}`,
      `Understanding: ${result.criterion.understandingUrl}`,
   ];

   if (options.verbose) {
      const slug = result.criterion.slug ?? 'none';
      const wcagVer = result.criterion.wcagVersion ?? 'unknown';
      const tags = result.criterion.tags?.join(', ') || 'none';
      lines.push(`Slug: ${slug}`, `WCAG version: ${wcagVer}`, `Tags: ${tags}`);
   }

   return lines.join('\n');
}

export function renderSearchText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      query: string;
      results: Array<{
         criterionId: string;
         title: string;
         level: string;
         score: number;
         matches?: Array<{ field: string; snippet: string }>;
      }>;
   };
   const lines = [`Search: ${result.query}`, ''];

   for (const entry of result.results) {
      lines.push(
         `${entry.criterionId}  ${entry.title} [${entry.level}] score=${entry.score}`,
      );
      if (options.verbose && entry.matches && entry.matches.length > 0) {
         for (const match of entry.matches) {
            lines.push(`  ${match.field}: ${match.snippet}`);
         }
      }
   }

   return lines.join('\n');
}

export function renderCoverageText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      criterion: { id: string; title: string };
      coverage: { coverageState: string; axeRuleIds: string[]; actRuleIds: string[] };
      strategy: {
         preferredEvidenceMode: string;
         procedureIds: string[];
         notes?: string[];
      };
   };

   const lines = [
      `${result.criterion.id}  ${result.criterion.title}`,
      `Coverage: ${result.coverage.coverageState}`,
      `axe: ${result.coverage.axeRuleIds.join(', ') || 'none'}`,
      `ACT: ${result.coverage.actRuleIds.join(', ') || 'none'}`,
      `Strategy: ${result.strategy.preferredEvidenceMode} (${result.strategy.procedureIds.join(', ')})`,
   ];

   if (options.verbose) {
      lines.push(`Strategy notes: ${result.strategy.notes?.join(' | ') || 'none'}`);
   }

   return lines.join('\n');
}

export function renderApplicableText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      target: { value: string };
      matrix: { assessments: Record<string, { state: string; reasons: string[] }> };
   };
   const lines = [`Applicable criteria for ${result.target.value}`, ''];

   for (const [criterionId, assessment] of Object.entries(result.matrix.assessments)) {
      lines.push(`${criterionId}  ${assessment.state}`);
      if (assessment.reasons[0]) {
         lines.push(`  ${assessment.reasons[0]}`);
      }
      if (options.verbose && assessment.reasons.length > 1) {
         for (const reason of assessment.reasons.slice(1)) {
            lines.push(`  ${reason}`);
         }
      }
   }

   return lines.join('\n');
}

export function renderCriterionApplicabilityText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      criterion: { id: string; title: string };
      assessment: { state: string; reasons: string[] };
      signals: Array<{ category: string; value: string }>;
   };

   const lines = [
      `${result.criterion.id}  ${result.criterion.title}`,
      `State: ${result.assessment.state}`,
      `Signals: ${result.signals.map((signal) => `${signal.category}=${signal.value}`).join('; ') || 'none'}`,
      `Reason: ${result.assessment.reasons[0] ?? 'none'}`,
   ];

   if (options.verbose && result.assessment.reasons.length > 1) {
      lines.push(`More reasons: ${result.assessment.reasons.slice(1).join(' | ')}`);
   }

   return lines.join('\n');
}

function formatViolation(entry: { id: string; impact: string | null }): string {
   if (entry.impact) {
      return `${entry.id} (${entry.impact})`;
   }
   return entry.id;
}

function formatRunAxeSelector(selection: {
   kind: string;
   criterion?: string;
   level?: string;
   ruleIds?: string[];
}): string {
   if (selection.kind === 'criterion') {
      return `criterion=${selection.criterion}`;
   }
   if (selection.kind === 'level') {
      return `level=${selection.level}`;
   }
   return `rules=${selection.ruleIds?.join(',')}`;
}

export function renderRunAxeText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as {
      url: string;
      selection: { kind: string; criterion?: string; level?: string; ruleIds?: string[] };
      ruleIds: string[];
      violations: Array<{ id: string; impact: string | null }>;
      passes: Array<{ id: string }>;
      incomplete: Array<{ id: string }>;
   };

   const selector = formatRunAxeSelector(result.selection);

   const lines = [
      `Selection: ${selector}`,
      `Violations: ${result.violations.map((entry) => formatViolation(entry)).join(', ') || 'none'}`,
      `Passes: ${result.passes.map((entry) => entry.id).join(', ') || 'none'}`,
      `Incomplete: ${result.incomplete.map((entry) => entry.id).join(', ') || 'none'}`,
   ];

   if (options.verbose) {
      lines.push(
         `URL: ${result.url}`,
         `Rule ids: ${result.ruleIds.join(', ') || 'none'}`,
      );
   }

   return lines.join('\n');
}

function formatSessionLabel(managedSession: boolean): string {
   if (managedSession) {
      return ' (managed)';
   }
   return ' (reused)';
}

export function renderPatternText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as InteractionPatternResult;
   const lines = [
      `Pattern: ${result.patternId}`,
      `Session: ${result.sessionId}${formatSessionLabel(result.managedSession)}`,
      `Assertions: ${result.assertions.map((entry) => `${entry.id}=${entry.status}`).join(', ') || 'none'}`,
      `Spoken phrases: ${result.spokenPhraseLog.join(' | ') || 'none'}`,
      `Item text: ${result.itemTextLog.join(' | ') || 'none'}`,
   ];

   if (options.verbose) {
      lines.push(
         `Steps: ${result.stepLog.map((entry) => entry.id).join(', ') || 'none'}`,
         `Browser evidence: ${result.browserEvidence.map((entry) => entry.kind).join(', ') || 'none'}`,
      );
   }

   if (!envelope.ok) {
      lines.push(
         `Errors: ${envelope.errors.map((entry) => entry.code).join(', ') || 'none'}`,
      );
   }

   return lines.join('\n');
}
