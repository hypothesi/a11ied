import { intro, log, outro } from '@clack/prompts';
import { createDoctorReport, listCliCommands, renderDoctorText } from '@a11lied/core';
import { startMcpServer } from '@a11lied/mcp-server';
import { Command } from 'commander';
import { registerDriveCommands } from './commands/drive.js';
import { registerInspectCommands } from './commands/inspect.js';
import { registerRunCommands } from './commands/run.js';
import { registerVerifyCommands } from './commands/verify.js';
import { registerWcagCommands } from './commands/wcag.js';
import { CLI_VERSION, JSON_INDENT, notReady } from './lib/helpers.js';

function registerDoctorCommand(program: Command): void {
   program
      .command('doctor')
      .description('Report runtime details and supported automation targets.')
      .option('--json', 'Print JSON instead of human-readable text.')
      .action((options: { json?: boolean }) => {
         const report = createDoctorReport();
         let output = renderDoctorText(report);
         if (options.json) {
            output = JSON.stringify(report, undefined, JSON_INDENT);
         }
         log.message(output);
      });
}

function registerCatalogCommand(program: Command): void {
   program
      .command('catalog')
      .description('List the planned command surface for the CLI.')
      .action(() => {
         intro('a11lied command catalog');
         for (const command of listCliCommands()) {
            log.message(`${command.name}: ${command.summary} [${command.maturity}]`);
         }
         outro('Catalog complete.');
      });
}

function registerStoryCommand(program: Command): void {
   program
      .command('story')
      .description('Run a Storybook scenario against a local dev server.')
      .action(() => {
         notReady('story');
      });
}

function registerMcpCommand(program: Command): void {
   program
      .command('mcp')
      .description('Start the MCP stdio server.')
      .action(async () => {
         await startMcpServer();
      });
}

function registerAllCommands(program: Command): void {
   registerWcagCommands(program);
   registerInspectCommands(program);
   registerDriveCommands(program);
   registerDoctorCommand(program);
   registerCatalogCommand(program);
   registerRunCommands(program);
   registerVerifyCommands(program);
   registerStoryCommand(program);
   registerMcpCommand(program);
}

export function buildCli(): Command {
   const program = new Command();

   program
      .name('a11lied')
      .description(
         'CLI-first accessibility automation for VoiceOver, NVDA, Storybook, and MCP.',
      )
      .version(CLI_VERSION)
      .enablePositionalOptions()
      .configureHelp({
         sortOptions: false,
         sortSubcommands: false,
      });

   registerAllCommands(program);

   return program;
}
