import { Command } from 'commander';
import { cliExitCodes } from '#contracts';
import { registerSessionCommands } from './commands/drive.js';
import { registerAxeCommand } from './commands/axe.js';
import { registerTreeCommand } from './commands/tree.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerSetupCommand } from './commands/setup.js';
import { registerWcagCommands } from './commands/wcag.js';
import { CLI_VERSION } from './lib/constants.js';
import { dim, getTerminalWidth, heading } from './lib/format.js';
import type { CommandExecution } from './lib/helpers.js';
import { renderFullHelp, subcommandTerm, TOP_LEVEL_GROUPS } from './lib/help.js';
import { styleCommandText } from './lib/text.js';

const NEXT_STEPS_HELP = dim(
   '\nRun a1 <command> --help for its options. Every command also takes --json.\n',
);

function registerDoctorCommand(program: Command): void {
   program
      .command('doctor')
      .helpGroup(TOP_LEVEL_GROUPS.setUp)
      .summary('Check the browser and screen reader setup.')
      .description(
         'Check this machine for browser and screen reader readiness, and list the setup steps still needed.',
      )
      .option('--json', 'Print JSON instead of human-readable text.')
      .option(
         '--strict',
         `Exit with code ${cliExitCodes.environment} when a required setup step is missing.`,
      )
      .action(async (options: { json?: boolean; strict?: boolean }) => {
         const [{ executeCommand }, { createDoctorReport }, renderers] =
            await Promise.all([
               import('./lib/execute.js'),
               import('#core'),
               import('./renderers/index.js'),
            ]);

         await executeCommand(
            {
               family: 'doctor',
               subcommand: 'doctor',
               wcagVersion: undefined,
               json: options.json,
            },
            () => {
               const report = createDoctorReport();
               const execution: CommandExecution = {
                  result: report as unknown as Record<string, unknown>,
               };
               if (options.strict && !report.ready) {
                  execution.exitCode = cliExitCodes.environment;
               }
               return execution;
            },
            renderers.renderDoctorEnvelopeText,
         );
      });
}

function registerMcpCommand(program: Command): void {
   program
      .command('mcp')
      .helpGroup(TOP_LEVEL_GROUPS.other)
      .summary('Serve the MCP tools over stdio.')
      .description('Start the MCP stdio server.')
      .action(async () => {
         const { startMcpServer } = await import('#mcp-server');
         await startMcpServer();
      });
}

function registerHelpAllCommand(program: Command): void {
   program
      .command('help-all')
      .helpGroup(TOP_LEVEL_GROUPS.other)
      .summary("Print every command's help.")
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

/** Registers every top-level command, in the order its group is listed in `a1 --help`. */
function registerAllCommands(program: Command): void {
   registerAuditCommand(program);
   registerAxeCommand(program);
   registerTreeCommand(program);
   registerSessionCommands(program);
   registerWcagCommands(program);
   registerDoctorCommand(program);
   registerSetupCommand(program);
   registerMcpCommand(program);
   registerHelpAllCommand(program);
}

/** Builds the public a1 CLI command tree. */
export function buildCli(): Command {
   const program = new Command();

   program
      .name('a1')
      .description('CLI-first accessibility automation for VoiceOver, NVDA, and MCP.')
      .version(CLI_VERSION)
      .enablePositionalOptions()
      .configureHelp({
         sortOptions: false,
         sortSubcommands: false,
         subcommandTerm,
         styleTitle: (text: string) => heading(text),
      })
      .configureOutput({
         getOutHelpWidth: () => getTerminalWidth(),
         getErrHelpWidth: () => getTerminalWidth(),
      })
      .addHelpText('after', NEXT_STEPS_HELP)
      // Realizes the help command now, so it lands in this group, not "Commands:".
      .commandsGroup(TOP_LEVEL_GROUPS.other)
      .helpCommand('help [command]', 'display help for command');

   registerAllCommands(program);

   return program;
}
