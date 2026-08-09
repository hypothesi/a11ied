import { log } from '@clack/prompts';
import { Command } from 'commander';
import { registerSessionCommands } from './commands/drive.js';
import { registerInspectCommands } from './commands/inspect.js';
import { registerAxeCommand } from './commands/axe.js';
import { registerWcagCommands } from './commands/wcag.js';
import { registerVerifyCommands } from './commands/verify.js';
import { CLI_VERSION, JSON_INDENT } from './lib/constants.js';
import { renderFullHelp } from './lib/help.js';
import { styleCommandText } from './lib/text.js';

function registerDoctorCommand(program: Command): void {
   program
      .command('doctor')
      .description(
         'Report runtime details, browser policy, and supported automation targets.',
      )
      .option('--json', 'Print JSON instead of human-readable text.')
      .action(async (options: { json?: boolean }) => {
         const { createDoctorReport, renderDoctorText } = await import('#core');
         const report = createDoctorReport();
         const renderedText = renderDoctorText(report);
         const output = options.json
            ? JSON.stringify(report, undefined, JSON_INDENT)
            : styleCommandText(renderedText);
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
      .action(async () => {
         const [core, renderers] = await Promise.all([
            import('#core'),
            import('./renderers/drive.js'),
         ]);
         const driveCommands = renderers.formatDriveCommands(core.listDriverCommands());
         process.stdout.write(
            `${renderFullHelp(program, {
               extraBlocks: [styleCommandText(driveCommands)],
            })}\n`,
         );
      });
}

function registerAllCommands(program: Command): void {
   registerSessionCommands(program);
   registerWcagCommands(program);
   registerAxeCommand(program);
   registerInspectCommands(program);
   registerVerifyCommands(program);
   registerMcpCommand(program);
   registerDoctorCommand(program);
   registerHelpAllCommand(program);
}

/** Builds the public a11ied CLI command tree. */
export function buildCli(): Command {
   const program = new Command();

   program
      .name('a11ied')
      .description('CLI-first accessibility automation for VoiceOver, NVDA, and MCP.')
      .version(CLI_VERSION)
      .enablePositionalOptions()
      .configureHelp({
         sortOptions: false,
         sortSubcommands: false,
      });

   registerAllCommands(program);

   return program;
}
