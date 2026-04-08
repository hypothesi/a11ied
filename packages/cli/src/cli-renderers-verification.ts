import type { CliOutputEnvelope } from '@a11lied/contracts';

interface VerificationCriterionRow {
   criterionId: string;
   criterion: { title: string };
   verdict: string;
   evidenceMode: string;
   procedureIds: string[];
   notes: string[];
   uncoveredWork: Array<{ kind?: string; message: string }>;
   evidence: Array<{ kind: string }>;
}

interface VerificationResult {
   requestedScope: { kind: string; criterion?: string; level?: string };
   wcagVersion: string;
   criteria: VerificationCriterionRow[];
   summary: {
      totalCriteria: number;
      failedCount: number;
      verdicts: Record<string, number>;
      evidenceModes: Record<string, number>;
   };
}

function formatScopeLabel(requestedScope: {
   kind: string;
   criterion?: string;
   level?: string;
}): string {
   if (requestedScope.kind === 'criterion') {
      return `criterion=${requestedScope.criterion}`;
   }
   if (requestedScope.kind === 'level') {
      return `level=${requestedScope.level}`;
   }
   return requestedScope.kind;
}

function formatVerdictsLine(verdicts: Record<string, number>): string {
   return `Verdicts: pass=${verdicts.pass}, fail=${verdicts.fail}, needs-manual-review=${verdicts['needs-manual-review']}, not-applicable=${verdicts['not-applicable']}, not-covered=${verdicts['not-covered']}, error=${verdicts.error}`;
}

function formatEvidenceModesLine(modes: Record<string, number>): string {
   return `Evidence modes: automated=${modes.automated}, hybrid=${modes.hybrid}, manual=${modes.manual}, unknown=${modes.unknown}`;
}

function formatWarningsLine(envelope: CliOutputEnvelope): string {
   return `Warnings: ${envelope.warnings.map((entry) => entry.code).join(', ') || 'none'}`;
}

function appendVerboseDetails(
   lines: string[],
   result: VerificationResult,
   envelope: CliOutputEnvelope,
): void {
   const uncoveredDetails = result.criteria
      .filter((row) => row.uncoveredWork.length > 0)
      .map(
         (row) =>
            `${row.criterionId}: ${row.uncoveredWork.map((entry) => entry.message).join(' | ')}`,
      );
   lines.push(formatWarningsLine(envelope));
   if (uncoveredDetails.length > 0) {
      lines.push('Uncovered work:', ...uncoveredDetails);
   }
}

function renderLevelVerificationText(
   result: VerificationResult,
   envelope: CliOutputEnvelope,
   opts: { verbose: boolean; scopeLabel: string },
): string {
   const manualOnlyIds = result.criteria
      .filter((row) => row.uncoveredWork.some((entry) => entry.kind === 'manual-only'))
      .map((row) => row.criterionId);
   const uncoveredIds = result.criteria
      .filter((row) => row.uncoveredWork.some((entry) => entry.kind !== 'manual-only'))
      .map((row) => row.criterionId);
   const lines = [
      `Scope: ${opts.scopeLabel}`,
      `WCAG: ${result.wcagVersion}`,
      `Summary: total=${result.summary.totalCriteria} failed=${result.summary.failedCount}`,
      formatVerdictsLine(result.summary.verdicts),
      formatEvidenceModesLine(result.summary.evidenceModes),
      `Manual-only criteria: ${manualOnlyIds.join(', ') || 'none'}`,
      `Uncovered criteria: ${uncoveredIds.join(', ') || 'none'}`,
      'Rows:',
      ...result.criteria.map(
         (row) =>
            `${row.criterionId} ${row.verdict} [${row.evidenceMode}] procedures=${row.procedureIds.join(',') || 'none'}`,
      ),
   ];

   if (opts.verbose) {
      appendVerboseDetails(lines, result, envelope);
   } else if (!envelope.ok) {
      lines.push(formatWarningsLine(envelope));
   }

   return lines.join('\n');
}

function appendCriterionDetails(
   lines: string[],
   opts: {
      row: VerificationCriterionRow;
      envelope: CliOutputEnvelope;
      verbose: boolean;
      failedCount: number;
   },
): void {
   if (opts.row.uncoveredWork.length > 0) {
      lines.push(
         `Uncovered work: ${opts.row.uncoveredWork.map((entry) => entry.message).join(' | ')}`,
      );
   }

   if (opts.verbose) {
      lines.push(
         `Notes: ${opts.row.notes.join(' | ') || 'none'}`,
         `Failed rows: ${opts.failedCount}`,
      );
   }

   if (!opts.envelope.ok) {
      lines.push(formatWarningsLine(opts.envelope));
   }
}

function renderCriterionVerificationText(
   result: VerificationResult,
   envelope: CliOutputEnvelope,
   opts: { verbose: boolean; scopeLabel: string },
): string {
   const row = result.criteria[0];

   if (!row) {
      return `Scope: ${result.requestedScope.kind}\nWCAG: ${result.wcagVersion}\nNo criteria were returned.`;
   }

   const lines = [
      `Scope: ${opts.scopeLabel}`,
      `WCAG: ${result.wcagVersion}`,
      `${row.criterionId}  ${row.criterion.title}`,
      `Verdict: ${row.verdict} [${row.evidenceMode}]`,
      `Procedures: ${row.procedureIds.join(', ') || 'none'}`,
      `Evidence: ${row.evidence.map((entry) => entry.kind).join(', ') || 'none'}`,
   ];

   appendCriterionDetails(lines, {
      row,
      envelope,
      verbose: opts.verbose,
      failedCount: result.summary.failedCount,
   });

   return lines.join('\n');
}

export function renderVerificationText(
   envelope: CliOutputEnvelope,
   options: { verbose: boolean },
): string {
   const result = envelope.result as unknown as VerificationResult;
   const scopeLabel = formatScopeLabel(result.requestedScope);

   if (result.requestedScope.kind === 'level') {
      return renderLevelVerificationText(result, envelope, {
         verbose: options.verbose,
         scopeLabel,
      });
   }

   return renderCriterionVerificationText(result, envelope, {
      verbose: options.verbose,
      scopeLabel,
   });
}
