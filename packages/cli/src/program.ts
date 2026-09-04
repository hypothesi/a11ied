import { Command } from 'commander';
import { cliExitCodes } from '#contracts';
import { registerSessionCommands } from './commands/drive.js';
import { registerInspectCommands } from './commands/inspect.js';
import { registerAxeCommand } from './commands/axe.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerWcagCommands } from './commands/wcag.js';
import { CLI_VERSION, JSON_INDENT } from './lib/constants.js';
import { renderFullHelp } from './lib/help.js';
import { styleCommandText } from './lib/text.js';

function registerDoctorCommand(program: Command): void {
   program
      .command('doctor')
      .description(
         'Check this machine for browser and screen reader readiness, and list the setup steps still needed.',
      )
      .option('--json', 'Print JSON instead of human-readable text.')
      .option(
         '--strict',
         `Exit with code ${cliExitCodes.environment} when a required setup step is missing.`,
      )
      .action(async (options: { json?: boolean; strict?: boolean }) => {
         const [{ createDoctorReport, renderDoctorText }, { doctorTextStyle }] =
            await Promise.all([import('#core'), import('./lib/format.js')]);
         const report = createDoctorReport();
         const output = options.json
            ? JSON.stringify(report, undefined, JSON_INDENT)
            : renderDoctorText(report, doctorTextStyle);
         process.stdout.write(`${output}\n`);
         if (options.strict && !report.ready) {
            process.exitCode = cliExitCodes.environment;
         }
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
   registerMcpCommand(program);
   registerDoctorCommand(program);
   registerSetupCommand(program);
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
