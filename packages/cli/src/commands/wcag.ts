import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import { addLookupOptions, addWcagVersionOption } from '../lib/options.js';
import { runLookupCommand, type LookupCommandInput } from '../lib/run-lookup.js';

const WCAG_EXAMPLES = `
Examples:
  a1 wcag 1.1.1
  a1 wcag rule image-alt
`;

interface WcagCommandOptions {
   json?: boolean;
   verbose?: boolean;
   wcag: string;
}

const TECHNIQUE_ID_PATTERN = /^[A-Z]+\d+$/;

function isTechniqueId(lookupKey: string): boolean {
   return TECHNIQUE_ID_PATTERN.test(lookupKey);
}

function withWcagOptions(command: Command): Command {
   return addLookupOptions(addWcagVersionOption(command));
}

async function runWcagCommand(input: {
   subcommand: string;
   options: WcagCommandOptions;
   buildResult: LookupCommandInput['buildResult'];
   renderText: LookupCommandInput['renderText'];
}): Promise<void> {
   await runLookupCommand({
      family: 'wcag',
      subcommand: input.subcommand,
      wcagVersion: input.options.wcag,
      json: input.options.json,
      verbose: input.options.verbose,
      buildResult: input.buildResult,
      renderText: input.renderText,
   });
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
         .summary('List criteria, optionally filtered to one level.')
         .description('List criteria, optionally filtered to one conformance level.')
         .option('--level <level>', 'Filter criteria to one WCAG level: A, AA, or AAA.')
         .option(
            '--summary',
            'Print how many criteria are automated, hybrid, and manual per level instead of the list.',
         ),
   ).action(
      async (options: WcagCommandOptions & { level?: string; summary?: boolean }) => {
         if (options.summary) {
            await runWcagCommand({
               subcommand: 'criteria',
               options,
               buildResult: (core) => core.showWcagTestMethodSummary(options.wcag),
               renderText: (renderers) => renderers.renderTestMethodSummaryText,
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
         .summary('Show one criterion with its techniques and failures.')
         .description(
            'Show one criterion by id or slug with its techniques, failures, and test method.',
         ),
   ).action(async (criterion: string, options: WcagCommandOptions) => {
      await showCriterionOrTechnique(criterion, options);
   });
}

function registerUnderstandingCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('understanding <criterion>')
         .summary('Print the full Understanding document for one criterion.')
         .description('Print the full Understanding document for one criterion.'),
   ).action(async (criterion: string, options: WcagCommandOptions) => {
      await runWcagCommand({
         subcommand: 'understanding',
         options,
         buildResult: (core) => core.showWcagUnderstanding(criterion, options.wcag),
         renderText: (renderers) => renderers.renderUnderstandingText,
      });
   });
}

function registerRuleCommand(wcagCommand: Command): void {
   withWcagOptions(
      wcagCommand
         .command('rule <ruleId>')
         .summary('Map one axe-core rule id to its WCAG criteria.')
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
      .helpGroup(TOP_LEVEL_GROUPS.lookUp)
      .summary('Criteria, techniques, axe rules, and the W3C guidance.')
      .description('Look up pinned WCAG requirements and test methods.')
      .argument(
         '[criterion]',
         'Show one criterion by id or slug, or one technique by id such as G18.',
      )
      .addHelpText('after', WCAG_EXAMPLES);

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
   registerUnderstandingCommand(wcagCommand);
   registerRuleCommand(wcagCommand);
}
