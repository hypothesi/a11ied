import { log } from '@clack/prompts';
import { Command } from 'commander';
import { registerDriveCommands } from './commands/drive.js';
import { registerInspectCommands } from './commands/inspect.js';
import { registerRunCommands } from './commands/run.js';
import { registerVerifyCommands } from './commands/verify.js';
import { registerWcagCommands } from './commands/wcag.js';
import { CLI_VERSION, JSON_INDENT } from './lib/constants.js';
import { renderFullHelp } from './lib/help.js';

function registerDoctorCommand(program: Command): void {
   program
      .command('doctor')
      .description('Report runtime details and supported automation targets.')
      .option('--json', 'Print JSON instead of human-readable text.')
      .action(async (options: { json?: boolean }) => {
         const { createDoctorReport, renderDoctorText } = await import('#core');
         const report = createDoctorReport();
         let output = renderDoctorText(report);
         if (options.json) {
            output = JSON.stringify(report, undefined, JSON_INDENT);
         }
         log.message(output);
      });
}

function registerMcpCommand(program: Command): void {
   program
      .command('mcp')
      .description('Start the MCP stdio server.')
      .action(async () => {
         const { startMcpServer } = await import('#mcp-server');
         await startMcpServer();
      });
}

function registerHelpAllCommand(program: Command): void {
   program
      .command('help-all')
      .description('Print help for the full command tree in one shot.')
      .action(() => {
         process.stdout.write(`${renderFullHelp(program)}\n`);
      });
}

function registerAllCommands(program: Command): void {
   registerWcagCommands(program);
   registerInspectCommands(program);
   registerDriveCommands(program);
   registerDoctorCommand(program);
   registerRunCommands(program);
   registerVerifyCommands(program);
   registerMcpCommand(program);
   registerHelpAllCommand(program);
}

/** Builds the public a11ied CLI command tree. */
export function buildCli(): Command {
   const program = new Command();

   program
      .name('a11ied')
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
