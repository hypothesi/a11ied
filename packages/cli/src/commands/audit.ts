import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { handleAuditAction, type AuditActionOptions } from './audit-actions.js';
import { registerAuditEvidenceCommands } from './audit-evidence.js';

interface AuditCommandOptions extends AuditActionOptions {
   format?: string;
   out?: string;
}

const AUDIT_EXAMPLES = `
Examples:
  a1 audit https://example.com
  a1 audit page.html --fail-on serious
`;

function buildAuditCommand(program: Command): Command {
   return addTargetTimeoutOption(
      addHtmlOption(
         addVerboseOption(
            addJsonOption(
               addWcagVersionOption(
                  program
                     .command('audit [target]')
                     .helpGroup(TOP_LEVEL_GROUPS.fix)
                     .summary('Scan a page and list what to fix.')
                     .description(
                        'Run the full audit loop against a target: axe, an ' +
                           'accessibility tree summary, the relevant criteria scan, and a ' +
                           'criterion rollup.',
                     )
                     .addHelpText('after', AUDIT_EXAMPLES)
                     .option(
                        '--fail-on <impact>',
                        'Only fail on axe violations at or above this impact: ' +
                           'minor, moderate, serious, or critical. Defaults to any ' +
                           'violation.',
                     )
                     .option(
                        '--baseline <file>',
                        'JSON file of accepted axe findings that do not count ' +
                           'toward the exit code.',
                     )
                     .option(
                        '--update-baseline',
                        'Write the current axe violations to --baseline instead ' +
                           'of asserting against it.',
                     )
                     .option(
                        '--results <file>',
                        'Read recorded manual results from here. Defaults to ' +
                           '.a11ied/evidence.jsonl, or $A11IED_EVIDENCE.',
                     )
                     .option(
                        '--format <format>',
                        'Output format: text, json, or earl. Defaults to text ' +
                           '(json with --json).',
                     )
                     .option(
                        '--out <file>',
                        'Write the report to this file instead of stdout.',
                     ),
               ),
            ),
         ),
      ),
   );
}

export function registerAuditCommand(program: Command): void {
   const auditCommand = buildAuditCommand(program);
   registerAuditEvidenceCommands(auditCommand);
   auditCommand.action(
      async (target: string | undefined, options: AuditCommandOptions) => {
         if (options.format === 'earl') {
            const { handleAuditEarlFormat } = await import('./audit-earl-output.js');
            await handleAuditEarlFormat(target, options);
            return;
         }

         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);

         await executeCommand(
            {
               family: 'audit',
               subcommand: 'audit',
               wcagVersion: options.wcag,
               json: options.json || options.format === 'json',
               verbose: options.verbose,
            },
            () => handleAuditAction(target, options),
            renderers.renderAuditText,
         );
      },
   );
}
