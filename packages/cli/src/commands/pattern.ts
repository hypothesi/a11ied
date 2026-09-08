import type { Command } from 'commander';

import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import { addLookupOptions } from '../lib/options.js';
import { runLookupCommand, type LookupCommandInput } from '../lib/run-lookup.js';
import { addSectionOption, parseSectionOption } from '../lib/sections.js';
import { registerPatternCheckCommand } from './pattern-check.js';
import {
   patternDetailSections,
   type PatternDetailSection,
} from '../renderers/pattern.js';

const PATTERN_EXAMPLES = `
Examples:
  a1 pattern combobox
  a1 pattern combobox-select-only
  a1 pattern role combobox
  a1 pattern attribute aria-expanded
`;

interface PatternCommandOptions {
   json?: boolean;
   verbose?: boolean;
   section?: string;
}

function withPatternOptions(command: Command): Command {
   return addSectionOption(addLookupOptions(command), patternDetailSections);
}

async function runPatternCommand(input: {
   subcommand: string;
   options: PatternCommandOptions;
   buildResult: LookupCommandInput['buildResult'];
   renderText: LookupCommandInput['renderText'];
}): Promise<void> {
   await runLookupCommand({
      family: 'pattern',
      subcommand: input.subcommand,
      json: input.options.json,
      verbose: input.options.verbose,
      buildResult: input.buildResult,
      renderText: input.renderText,
   });
}

function readSections(
   options: PatternCommandOptions,
): ReadonlyArray<PatternDetailSection> {
   return parseSectionOption(options.section, patternDetailSections);
}

/**
 * Shows whichever the name resolves to.
 *
 * Both the lookup and the `--section` check run inside the command handler, so a bad name
 * or a bad section name prints a usage error and exits 2 rather than throwing a stack
 * trace.
 */
async function showPatternOrExample(
   name: string,
   options: PatternCommandOptions,
): Promise<void> {
   await runPatternCommand({
      subcommand: 'show',
      options,
      buildResult: (core) => {
         readSections(options);
         return core.showApgPatternOrExample(name);
      },
      renderText:
         (renderers) =>
         (envelope, textOptions): string =>
            renderers.renderPatternLookupText(envelope, {
               ...textOptions,
               sections: readSections(options),
            }),
   });
}

/**
 * Bare `a1 pattern` lists the patterns. Unlike `a1 wcag` there is no interactive finder
 * yet, and a list of 28 ids fits on a screen, so the list is the more useful default.
 */
async function runPatternEntry(options: PatternCommandOptions): Promise<void> {
   await runPatternCommand({
      subcommand: 'list',
      options,
      buildResult: (core) => core.listApgPatternSummaries(),
      renderText: (renderers) => renderers.renderPatternListText,
   });
}

function registerListCommand(patternCommand: Command): void {
   addLookupOptions(
      patternCommand
         .command('list')
         .summary('List every ARIA pattern the APG publishes.')
         .description(
            'List every ARIA pattern the APG publishes, with its example count.',
         ),
   ).action(async (options: PatternCommandOptions) => {
      await runPatternEntry(options);
   });
}

function registerRoleCommand(patternCommand: Command): void {
   addLookupOptions(
      patternCommand
         .command('role <role>')
         .summary('List the examples the APG files under one ARIA role.')
         .description(
            'List the examples the APG example index files under one ARIA role, such as combobox.',
         ),
   ).action(async (role: string, options: PatternCommandOptions) => {
      await runPatternCommand({
         subcommand: 'role',
         options,
         buildResult: (core) => core.findApgExamples({ role }),
         renderText: (renderers) => renderers.renderPatternFindText,
      });
   });
}

function registerAttributeCommand(patternCommand: Command): void {
   addLookupOptions(
      patternCommand
         .command('attribute <attribute>')
         .summary('List the examples the APG files under one ARIA attribute.')
         .description(
            'List the examples the APG example index files under one property or state, such as aria-expanded.',
         ),
   ).action(async (attribute: string, options: PatternCommandOptions) => {
      await runPatternCommand({
         subcommand: 'attribute',
         options,
         buildResult: (core) => core.findApgExamples({ attribute }),
         renderText: (renderers) => renderers.renderPatternFindText,
      });
   });
}

export function registerPatternCommands(program: Command): void {
   const patternCommand = program
      .command('pattern')
      .helpGroup(TOP_LEVEL_GROUPS.lookUp)
      .summary('ARIA patterns: keyboard support and required attributes.')
      .description(
         'Look up the pinned ARIA Authoring Practices Guide keyboard and attribute tables.',
      )
      .argument('[name]', 'Show one pattern by id, or one example by id.')
      .addHelpText('after', PATTERN_EXAMPLES);

   withPatternOptions(patternCommand).action(
      async (name: string | undefined, options: PatternCommandOptions) => {
         if (name === undefined) {
            await runPatternEntry(options);
            return;
         }
         await showPatternOrExample(name, options);
      },
   );

   registerListCommand(patternCommand);
   registerRoleCommand(patternCommand);
   registerAttributeCommand(patternCommand);
   registerPatternCheckCommand(patternCommand);
}
