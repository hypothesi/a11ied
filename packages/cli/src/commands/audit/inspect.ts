import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
   dismissFinding,
   getAuditStatus,
   getFinding,
   listEvents,
   listFindings,
   listSignals,
   listUnits,
   mergeFindings,
   renderDashboardHtml,
   REPORT_FORMATS,
   severitySchema,
   startDashboardServer,
   updateFinding,
   writeAuditReport,
   type FindingEdit,
   type ReportFormat,
} from '@a11ied/audit';
import type { Command } from 'commander';
import { CliUsageError } from '#core';
import {
   renderEvents,
   renderFinding,
   renderFindingList,
   renderStatus,
   renderUnits,
} from './render.js';
import {
   addAuditOptions,
   runAuditCommand,
   splitList,
   type AuditBaseOptions,
} from './run.js';

const DEFAULT_LOG_LIMIT = 50;
const DEFAULT_PORT = 4173;

interface FindingsOptions extends AuditBaseOptions {
   criterion?: string;
   page?: string;
   all?: boolean;
}

interface UpdateOptions extends AuditBaseOptions {
   title?: string;
   severity?: string;
   description?: string;
   impact?: string;
   recommendation?: string;
}

interface ReportOptions extends AuditBaseOptions {
   format?: string;
   out?: string;
   linkEvidence?: boolean;
}

function registerStatus(parent: Command): void {
   addAuditOptions(
      parent
         .command('status')
         .summary('Show progress, active workers, blocked units, and recent activity.')
         .option('--units', 'List every unit with its state instead of the summary.'),
   ).action(async (options: AuditBaseOptions & { units?: boolean }) => {
      await runAuditCommand({
         subcommand: 'status',
         options,
         work: (audit) => ({ status: getAuditStatus(audit), units: listUnits(audit) }),
         text: (result) =>
            options.units ? renderUnits(result.units) : renderStatus(result.status),
      });
   });
}

function registerLog(parent: Command): void {
   addAuditOptions(
      parent
         .command('log')
         .summary('Print the activity log: every claim, submission, block, and recovery.')
         .option('--unit <id>', 'Only events for this unit.')
         .option(
            '--limit <count>',
            `Most recent events to print. Defaults to ${String(DEFAULT_LOG_LIMIT)}.`,
         ),
   ).action(async (options: AuditBaseOptions & { unit?: string; limit?: string }) => {
      await runAuditCommand({
         subcommand: 'log',
         options,
         work: (audit) => ({
            events: listEvents(audit, {
               unitId: options.unit,
               limit: options.limit
                  ? Number.parseInt(options.limit, 10)
                  : DEFAULT_LOG_LIMIT,
            }),
         }),
         text: (result) => renderEvents(result.events).join('\n'),
      });
   });
}

function buildEdit(options: UpdateOptions): FindingEdit {
   const edit: FindingEdit = {};
   if (options.title !== undefined) {
      edit.title = options.title;
   }
   if (options.severity !== undefined) {
      edit.severity = severitySchema.parse(options.severity);
   }
   if (options.description !== undefined) {
      edit.description = options.description;
   }
   if (options.impact !== undefined) {
      edit.impact = options.impact;
   }
   if (options.recommendation !== undefined) {
      edit.recommendation = options.recommendation;
   }
   if (Object.keys(edit).length === 0) {
      throw new CliUsageError(
         'nothing-to-update',
         'Pass at least one of --title, --severity, --description, --impact, --recommendation.',
      );
   }
   return edit;
}

function registerFindingEdits(finding: Command): void {
   addAuditOptions(
      finding
         .command('dismiss <finding>')
         .summary('Dismiss a finding as wrong, everywhere or on one page.')
         .requiredOption('--reason <text>', 'Why it is not a failure.')
         .option('--page <id>', 'Dismiss it on this page only.'),
   ).action(
      async (
         findingId: string,
         options: AuditBaseOptions & { reason: string; page?: string },
      ) => {
         await runAuditCommand({
            subcommand: 'finding dismiss',
            options,
            work: (audit) => ({
               finding: dismissFinding(audit, {
                  findingId,
                  reason: options.reason,
                  pageId: options.page,
                  actor: 'lead',
               }),
            }),
            text: (result) => renderFinding(result.finding),
         });
      },
   );
   addAuditOptions(
      finding
         .command('merge <into> <from...>')
         .summary('Fold duplicate findings into one, keeping every occurrence.'),
   ).action(async (into: string, from: string[], options: AuditBaseOptions) => {
      await runAuditCommand({
         subcommand: 'finding merge',
         options,
         work: (audit) => ({
            finding: mergeFindings(audit, { into, from, actor: 'lead' }),
         }),
         text: (result) => renderFinding(result.finding),
      });
   });
   addAuditOptions(
      finding
         .command('update <finding>')
         .summary("Rewrite a finding's title, severity, or text.")
         .option('--title <text>', 'The defect in a few words.')
         .option('--severity <level>', 'critical, serious, moderate, or minor.')
         .option('--description <text>', 'What is wrong.')
         .option('--impact <text>', 'Who is affected and how.')
         .option('--recommendation <text>', 'The change that fixes it.'),
   ).action(async (findingId: string, options: UpdateOptions) => {
      await runAuditCommand({
         subcommand: 'finding update',
         options,
         work: (audit) => ({
            finding: updateFinding(audit, {
               findingId,
               actor: 'lead',
               changes: buildEdit(options),
            }),
         }),
         text: (result) => renderFinding(result.finding),
      });
   });
}

function registerFindings(parent: Command): void {
   addAuditOptions(
      parent
         .command('findings')
         .summary('List the findings recorded so far.')
         .option('--criterion <id>', 'Only findings for this criterion.')
         .option('--page <id>', 'Only findings on this page.')
         .option('--all', 'Include dismissed findings.'),
   ).action(async (options: FindingsOptions) => {
      await runAuditCommand({
         subcommand: 'findings',
         options,
         work: (audit) => ({
            findings: listFindings(audit, {
               criterion: options.criterion,
               pageId: options.page,
               includeDismissed: options.all,
            }),
         }),
         text: (result) => renderFindingList(result.findings),
      });
   });
   const finding = parent
      .command('finding')
      .summary('Show, dismiss, merge, or rewrite one finding.');
   addAuditOptions(
      finding.command('show <finding>').summary('Print a finding and its occurrences.'),
   ).action(async (findingId: string, options: AuditBaseOptions) => {
      await runAuditCommand({
         subcommand: 'finding show',
         options,
         work: (audit) => ({ finding: getFinding(audit, findingId) }),
         text: (result) => renderFinding(result.finding),
      });
   });
   registerFindingEdits(finding);
}

function registerSignals(parent: Command): void {
   addAuditOptions(
      parent
         .command('signals <page>')
         .summary('Print the facts the automated scan collected for a page.')
         .option(
            '--kind <kind>',
            'Only this kind: axe, structure, keyboard, layout, media, forms, pointer, navigation.',
         ),
   ).action(async (pageId: string, options: AuditBaseOptions & { kind?: string }) => {
      await runAuditCommand({
         subcommand: 'signals',
         options,
         work: (audit) => ({
            signals: listSignals(audit, pageId).filter(
               (signal) => options.kind === undefined || signal.kind === options.kind,
            ),
         }),
         text: (result) =>
            result.signals.length === 0
               ? 'No signals. Run a1 audit scan first.'
               : result.signals
                    .map((signal) => `${signal.kind}: ${JSON.stringify(signal.data)}`)
                    .join('\n'),
      });
   });
}

function registerDashboard(parent: Command): void {
   addAuditOptions(
      parent
         .command('dashboard')
         .summary('Serve a live progress page, or write a snapshot of it.')
         .description(
            'Serve a page on localhost that refreshes every five seconds: progress by page and ' +
               'test pass, active workers, blocked units, findings, and the activity log. It ' +
               'links to a live interim report. Runs until interrupted.',
         )
         .option(
            '--port <port>',
            `Port to listen on. Defaults to ${String(DEFAULT_PORT)}.`,
         )
         .option('--out <file>', 'Write a static snapshot to this file and exit.'),
   ).action(async (options: AuditBaseOptions & { port?: string; out?: string }) => {
      const { out } = options;
      if (out !== undefined) {
         await runAuditCommand({
            subcommand: 'dashboard',
            options,
            work: (audit) => {
               const file = resolve(out);
               writeFileSync(file, renderDashboardHtml(audit));
               return { file };
            },
            text: (result) => `Wrote ${result.file}`,
         });
         return;
      }
      const { openAudit, resolveAuditDir } = await import('@a11ied/audit');
      const audit = openAudit(resolveAuditDir(options.audit));
      const server = await startDashboardServer(
         audit,
         options.port ? Number.parseInt(options.port, 10) : DEFAULT_PORT,
      );
      process.stdout.write(`Audit dashboard: ${server.url}\nPress Ctrl+C to stop.\n`);
   });
}

function parseFormats(value: string | undefined): readonly ReportFormat[] {
   const requested = splitList(value);
   if (requested.length === 0) {
      return REPORT_FORMATS;
   }
   const formats = REPORT_FORMATS.filter((format) => requested.includes(format));
   if (formats.length !== requested.length) {
      throw new CliUsageError(
         'unknown-format',
         `Unknown report format in "${value ?? ''}". Use any of: ${REPORT_FORMATS.join(', ')}.`,
      );
   }
   return formats;
}

function registerReport(parent: Command): void {
   addAuditOptions(
      parent
         .command('report')
         .summary('Build the audit report as HTML, Markdown, and JSON.')
         .description(
            'Build the report from the current state of the audit. Before every unit is done ' +
               'the report is marked interim and lists what is unfinished. The HTML report is a ' +
               'single self-contained file; print it from a browser for PDF.',
         )
         .option(
            '--format <list>',
            'Formats to write: html, md, json. Defaults to all three.',
         )
         .option(
            '--out <dir>',
            'Directory to write to. Defaults to report/ in the audit.',
         )
         .option(
            '--link-evidence',
            'Link to screenshots instead of embedding them in the HTML file.',
         ),
   ).action(async (options: ReportOptions) => {
      await runAuditCommand({
         subcommand: 'report',
         options,
         work: (audit) => {
            const written = writeAuditReport(audit, {
               formats: parseFormats(options.format),
               outDir: options.out,
               embedEvidence: !options.linkEvidence,
            });
            return {
               files: written.files,
               final: written.report.final,
               verdict: written.report.verdict,
               gaps: written.report.gaps.length,
               findings: written.report.findings.length,
            };
         },
         text: (result) =>
            [
               `${result.final ? 'Final' : 'Interim'} report: ${String(result.findings)} finding(s), ${String(result.gaps)} unverified or unfinished item(s).`,
               ...result.files.map((file) => `  ${file}`),
            ].join('\n'),
      });
   });
}

/** Registers the commands for watching an audit, curating findings, and reporting. */
export function registerInspectCommands(parent: Command): void {
   registerStatus(parent);
   registerLog(parent);
   registerFindings(parent);
   registerSignals(parent);
   registerDashboard(parent);
   registerReport(parent);
}
