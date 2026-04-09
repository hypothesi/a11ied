import type { Command } from 'commander';
import { addJsonOption, addVerboseOption, addWcagVersionOption } from '../lib/options.js';

function registerLevelsCommand(wcagCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            wcagCommand
               .command('levels')
               .description('List the available conformance levels.'),
         ),
      ),
   ).action(async (options: { json?: boolean; verbose?: boolean; version: string }) => {
      const [{ executeCommand }, renderers, core] = await Promise.all([
         import('../lib/execute.js'),
         import('../renderers/index.js'),
         import('#core'),
      ]);

      await executeCommand(
         {
            family: 'wcag',
            subcommand: 'levels',
            wcagVersion: options.version,
            json: options.json,
            verbose: options.verbose,
         },
         () => ({
            result: core.listWcagLevels(options.version),
         }),
         renderers.renderWcagLevelsText,
      );
   });
}

function registerCriteriaCommand(wcagCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            wcagCommand
               .command('criteria')
               .description('List criteria for a specific conformance level.')
               .requiredOption(
                  '--level <level>',
                  'Filter criteria to one WCAG level: A, AA, or AAA.',
               ),
         ),
      ),
   ).action(
      async (options: {
         json?: boolean;
         verbose?: boolean;
         version: string;
         level: string;
      }) => {
         const [{ executeCommand }, renderers, core] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'wcag',
               subcommand: 'criteria',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => ({
               result: core.listWcagCriteria(options.level, options.version),
            }),
            renderers.renderCriteriaText,
         );
      },
   );
}

function registerShowCommand(wcagCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            wcagCommand
               .command('show <criterion>')
               .description('Show one criterion by id or slug.'),
         ),
      ),
   ).action(
      async (
         criterion: string,
         options: { json?: boolean; verbose?: boolean; version: string },
      ) => {
         const [{ executeCommand }, renderers, core] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'wcag',
               subcommand: 'show',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => ({
               result: core.showWcagCriterion(criterion, options.version),
            }),
            renderers.renderShowCriterionText,
         );
      },
   );
}

function registerSearchCommand(wcagCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            wcagCommand
               .command('search <query>')
               .description(
                  'Search criterion titles, summaries, techniques, failures, and tags.',
               )
               .option('--limit <count>', 'Limit the number of returned rows.', '10'),
         ),
      ),
   ).action(
      async (
         query: string,
         options: { json?: boolean; verbose?: boolean; version: string; limit: string },
      ) => {
         const [{ executeCommand }, renderers, core] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'wcag',
               subcommand: 'search',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => ({
               result: core.searchWcagCriteria(query, {
                  version: options.version,
                  limit: Number.parseInt(options.limit, 10),
               }),
            }),
            renderers.renderSearchText,
         );
      },
   );
}

function registerCoverageCommand(wcagCommand: Command): void {
   addVerboseOption(
      addJsonOption(
         addWcagVersionOption(
            wcagCommand
               .command('coverage <criterion>')
               .description(
                  'Show automation coverage and preferred strategy for one criterion.',
               ),
         ),
      ),
   ).action(
      async (
         criterion: string,
         options: { json?: boolean; verbose?: boolean; version: string },
      ) => {
         const [{ executeCommand }, renderers, core] = await Promise.all([
            import('../lib/execute.js'),
            import('../renderers/index.js'),
            import('#core'),
         ]);

         await executeCommand(
            {
               family: 'wcag',
               subcommand: 'coverage',
               wcagVersion: options.version,
               json: options.json,
               verbose: options.verbose,
            },
            () => ({
               result: core.showWcagCoverage(criterion, options.version),
            }),
            renderers.renderCoverageText,
         );
      },
   );
}

export function registerWcagCommands(program: Command): void {
   const wcagCommand = program
      .command('wcag')
      .description('Look up pinned WCAG requirements and coverage data.');

   registerLevelsCommand(wcagCommand);
   registerCriteriaCommand(wcagCommand);
   registerShowCommand(wcagCommand);
   registerSearchCommand(wcagCommand);
   registerCoverageCommand(wcagCommand);
}
