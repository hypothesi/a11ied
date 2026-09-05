import type { Command } from 'commander';
import type { CliOutputEnvelope } from '#contracts';
import type * as CoreModuleNamespace from '#core';
import type * as RenderersNamespace from '../renderers/index.js';
import { addJsonOption, addVerboseOption, addWcagVersionOption } from '../lib/options.js';

interface WcagCommandOptions {
   json?: boolean;
   verbose?: boolean;
   wcag: string;
}

type CoreModule = typeof CoreModuleNamespace;
type Renderers = typeof RenderersNamespace;
type RenderText = (envelope: CliOutputEnvelope, options: { verbose: boolean }) => string;
type CommandResult = Record<string, unknown> | Promise<Record<string, unknown>>;

const TECHNIQUE_ID_PATTERN = /^[A-Z]+\d+$/;

function isTechniqueId(lookupKey: string): boolean {
   return TECHNIQUE_ID_PATTERN.test(lookupKey);
}

function withWcagOptions(command: Command): Command {
   return addVerboseOption(addJsonOption(addWcagVersionOption(command)));
}

async function runWcagCommand(input: {
   subcommand: string;
   options: WcagCommandOptions;
   buildResult: (core: CoreModule) => CommandResult;
   renderText: (renderers: Renderers) => RenderText;
}): Promise<void> {
   const [{ executeCommand }, renderers, core] = await Promise.all([
      import('../lib/execute.js'),
      import('../renderers/index.js'),
      import('#core'),
   ]);

   await executeCommand(
      {
         family: 'wcag',
         subcommand: input.subcommand,
         wcagVersion: input.options.wcag,
         json: input.options.json,
         verbose: input.options.verbose,
      },
      async () => ({ result: await input.buildResult(core) }),
      input.renderText(renderers),
   );
}

async function showCriterionOrTechnique(
   lookupKey: string,
   options: WcagCommandOptions,
): Promise<void> {
   if (isTechniqueId(lookupKey)) {
      await runWcagCommand({
         subcommand: 'technique',
         options,
         buildResult: (core) => core.showWcagTechnique(lookupKey, options.wcag),
         renderText: (renderers) => renderers.renderTechniqueText,
      });
      return;
   }
   await runWcagCommand({
      subcommand: 'show',
      options,
      buildResult: (core) => core.showWcagCriterion(lookupKey, options.wcag),
      renderText: (renderers) => renderers.renderShowCriterionText,
   });
}

/**
 * Bare `a1 wcag` opens the interactive finder on a terminal. Piped output and --json get
 * the help text instead, so scripts never block on a TUI.
 */
async function runWcagEntry(
   wcagCommand: Command,
   options: WcagCommandOptions,
): Promise<void> {
   if (!process.stdout.isTTY || !process.stdin.isTTY || options.json) {
      wcagCommand.outputHelp();
      return;
   }
   const { runWcagFinder } = await import('../tui/finder.js');
   await runWcagFinder({ version: options.wcag });
}

function registerCriteriaCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('criteria')
         .description('List criteria, optionally filtered to one conformance level.')
         .option('--level <level>', 'Filter criteria to one WCAG level: A, AA, or AAA.')
         .option('--summary', 'Print coverage totals per level instead of the list.'),
   ).action(
      async (options: WcagCommandOptions & { level?: string; summary?: boolean }) => {
         if (options.summary) {
            await runWcagCommand({
               subcommand: 'criteria',
               options,
               buildResult: (core) => core.showWcagCoverageSummary(options.wcag),
               renderText: (renderers) => renderers.renderCoverageSummaryText,
            });
            return;
         }
         await runWcagCommand({
            subcommand: 'criteria',
            options,
            buildResult: (core) => core.listWcagCriteria(options.level, options.wcag),
            renderText: (renderers) => renderers.renderCriteriaText,
         });
      },
   );
}

function registerShowCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('show <criterion>')
         .description(
            'Show one criterion by id or slug with its techniques, failures, and coverage.',
         ),
   ).action(async (criterion: string, options: WcagCommandOptions) => {
      await showCriterionOrTechnique(criterion, options);
   });
}

function registerSearchCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('search <query>')
         .description(
            'Search criterion titles, summaries, techniques, failures, and tags.',
         )
         .option('--limit <count>', 'Limit the number of returned rows.', '10'),
   ).action(async (query: string, options: WcagCommandOptions & { limit: string }) => {
      await runWcagCommand({
         subcommand: 'search',
         options,
         buildResult: (core) =>
            core.searchWcagCriteria(query, {
               version: options.wcag,
               limit: Number.parseInt(options.limit, 10),
            }),
         renderText: (renderers) => renderers.renderSearchText,
      });
   });
}

function registerRuleCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('rule <ruleId>')
         .description(
            'Map one axe-core rule id to its criteria, techniques, failures, and fix guidance.',
         ),
   ).action(async (ruleId: string, options: WcagCommandOptions) => {
      await runWcagCommand({
         subcommand: 'rule',
         options,
         buildResult: (core) => core.showWcagAxeRule(ruleId, options.wcag),
         renderText: (renderers) => renderers.renderAxeRuleText,
      });
   });
}

export function registerWcagCommands(program: Command): void {
   const wcagCommand = program
      .command('wcag')
      .description('Look up pinned WCAG requirements and coverage data.')
      .argument(
         '[criterion]',
         'Show one criterion by id or slug, or one technique by id such as G18.',
      );

   withWcagOptions(wcagCommand).action(
      async (criterion: string | undefined, options: WcagCommandOptions) => {
         if (criterion === undefined) {
            await runWcagEntry(wcagCommand, options);
            return;
         }
         await showCriterionOrTechnique(criterion, options);
      },
   );

   registerCriteriaCommand(wcagCommand);
   registerShowCommand(wcagCommand);
   registerSearchCommand(wcagCommand);
   registerRuleCommand(wcagCommand);
}
