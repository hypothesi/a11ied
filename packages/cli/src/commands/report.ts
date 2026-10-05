import type { Command } from 'commander';

import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import { addJsonOption, addVerboseOption, addWcagVersionOption } from '../lib/options.js';
import {
   handleReportBuildAction,
   type ReportBuildActionOptions,
} from './report-actions.js';

export function registerReportCommand(program: Command): void {
   const report = program
      .command('report')
      .helpGroup(TOP_LEVEL_GROUPS.fix)
      .summary('Build a multi-page accessibility report.');
   const build = addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            report
               .command('build')
               .summary('Build HTML, PDF, EARL, and JSON reports.')
               .requiredOption('--inventory <file>', 'Discovery inventory JSON file.')
               .requiredOption(
                  '--results-dir <dir>',
                  'Directory containing per-page audit results.',
               )
               .requiredOption('--out <dir>', 'Output directory for the report bundle.')
               .option('--title <text>', 'Report title.')
               .option(
                  '--draft',
                  'Render available results from an unfinished assessment as a draft.',
               )
               .option(
                  '--formats <list>',
                  'Comma-separated html,pdf,earl,json. Defaults to all.',
               )
               .option(
                  '--fail-on <impact>',
                  'Fail at or above minor, moderate, serious, or critical. Findings with unassessed severity always fail.',
               ),
         ),
      ),
   );
   build.action(
      async (
         options: ReportBuildActionOptions & {
            json?: boolean;
            verbose?: boolean;
            wcag: string;
         },
      ) => {
         const [{ executeCommand }, renderers] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
         ]);
         await executeCommand(
            {
               family: 'report',
               subcommand: 'build',
               wcagVersion: options.wcag,
               json: options.json,
               verbose: options.verbose,
            },
            () => handleReportBuildAction(options),
            renderers.renderReportText,
         );
      },
   );
}
