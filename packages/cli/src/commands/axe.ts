import type { Command } from 'commander';
import { TOP_LEVEL_GROUPS } from '../lib/help.js';
import {
   addHtmlOption,
   addJsonOption,
   addTargetTimeoutOption,
   addVerboseOption,
   addWcagVersionOption,
} from '../lib/options.js';
import { handleAxeAction, type AxeActionOptions } from './axe-actions.js';

const AXE_GROUPS = {
   rules: 'Choose rules:',
   scope: 'Scope the page:',
   verdict: 'Decide the verdict:',
   output: 'Output:',
} as const;

const AXE_EXAMPLES = `
Examples:
  a1 axe https://example.com --level AA
  a1 axe page.html --rule image-alt --json
`;

function addAxeRuleOptions(command: Command): Command {
   return command
      .option('--level <level>', 'Limit the run to one WCAG level.')
      .option(
         '--criterion <criterion>',
         'Limit the run to one WCAG criterion id or slug.',
      )
      .option(
         '--rule <ruleId...>',
         'Limit the run to one or more explicit axe rule ids.',
      );
}

function addAxePageScopeOptions(command: Command): Command {
   return command
      .option(
         '--selector <css>',
         'Scope the scan to elements matching this CSS selector.',
      )
      .option(
         '--exclude <css>',
         'Exclude elements matching this CSS selector from the scan.',
      )
      .option(
         '--wait-for <css>',
         'Wait for an element matching this CSS selector before scanning.',
      )
      .option('--viewport <WxH>', 'Set the browser viewport, for example 1280x800.')
      .option(
         '--header <header...>',
         "Repeatable. Add a request header, as 'Name: value'.",
      )
      .option('--cookie <cookie...>', "Repeatable. Add a cookie, as 'name=value'.");
}

function addAxeVerdictOptions(command: Command): Command {
   return command
      .option(
         '--fail-on <impact>',
         'Only fail on violations at or above this impact: minor, ' +
            'moderate, serious, or critical. Defaults to any violation.',
      )
      .option(
         '--baseline <file>',
         'JSON file of accepted findings, keyed by rule id and ' +
            'node target, that do not count toward the exit code.',
      )
      .option(
         '--update-baseline',
         'Write the current violations to --baseline instead of ' +
            'asserting against it.',
      );
}

function addAxeOutputOptions(command: Command): Command {
   return command
      .option(
         '--format <format>',
         'Output format: text, json, or sarif. Defaults to text (json with --json).',
      )
      .option('--out <file>', 'Write the report to this file instead of stdout.');
}

function buildAxeCommand(program: Command): Command {
   const axeCommand = program
      .command('axe [targets...]')
      .helpGroup(TOP_LEVEL_GROUPS.fix)
      .summary('Run axe-core against one or more targets.')
      .description(
         'Run axe-core against one or more targets: an http(s) URL, a file path, - ' +
            'for HTML on stdin, or --html.',
      )
      .addHelpText('after', AXE_EXAMPLES);

   addAxeRuleOptions(axeCommand.optionsGroup(AXE_GROUPS.rules));
   addAxePageScopeOptions(axeCommand.optionsGroup(AXE_GROUPS.scope));
   addHtmlOption(axeCommand);
   addTargetTimeoutOption(axeCommand);
   addAxeVerdictOptions(axeCommand.optionsGroup(AXE_GROUPS.verdict));
   addAxeOutputOptions(axeCommand.optionsGroup(AXE_GROUPS.output));
   addWcagVersionOption(axeCommand);
   addJsonOption(axeCommand);
   addVerboseOption(axeCommand);

   return axeCommand;
}

interface AxeCommandOptions extends AxeActionOptions {
   format?: string;
   out?: string;
}

async function runAxeCommand(
   targets: string[],
   options: AxeCommandOptions,
): Promise<void> {
   if (options.format === 'sarif') {
      const { handleAxeSarifFormat } = await import('./axe-sarif-output.js');
      await handleAxeSarifFormat(targets, options);
      return;
   }

   const [{ executeCommand }, renderers] = await Promise.all([
      import('../lib/execute.js'),
      import('../renderers/index.js'),
   ]);
   const isMultiTarget = targets.length > 1;
   const json = options.json || options.format === 'json';

   await executeCommand(
      {
         family: 'axe',
         subcommand: 'axe',
         wcagVersion: options.wcag,
         json,
         verbose: options.verbose,
      },
      async () => {
         if (isMultiTarget) {
            const { handleMultiAxeAction } = await import('./axe-multi.js');
            return handleMultiAxeAction(targets, options);
         }
         return handleAxeAction(targets[0], options);
      },
      isMultiTarget ? renderers.renderMultiAxeText : renderers.renderRunAxeText,
   );
}

export function registerAxeCommand(program: Command): void {
   buildAxeCommand(program).action(
      async (targets: string[], options: AxeCommandOptions) => {
         await runAxeCommand(targets, options);
      },
   );
}
