import type { Command } from 'commander';
import { cliExitCodes, type DoctorReport } from '#contracts';
import type * as Core from '#core';
import type { GuidepupSetupStep, GuidepupSetupStepResult } from '#core';
import { code, dim, doctorTextStyle, heading } from '../lib/format.js';
import type { CommandExecution } from '../lib/helpers.js';

interface SetupOptions {
   json?: boolean;
   skipSetup?: boolean;
   skipInstall?: boolean;
}

interface SetupStepOutcome {
   id: string;
   label: string;
   command: string;
   exitCode: number;
}

interface SetupResult {
   steps: SetupStepOutcome[];
   report?: DoctorReport;
}

function write(text: string): void {
   process.stdout.write(`${text}\n`);
}

function announceStep(step: GuidepupSetupStep, index: number, total: number): void {
   write('');
   write(heading(`Step ${index + 1} of ${total}: ${step.label}`));
   write(`  ${code(step.command)}  ${dim(`in ${step.cwd}`)}`);
   write('');
}

function toStepOutcome(result: GuidepupSetupStepResult): SetupStepOutcome {
   return {
      id: result.step.id,
      label: result.step.label,
      command: result.step.command,
      exitCode: result.exitCode,
   };
}

/** Runs the Guidepup setup steps, then the doctor check if every step passed. */
async function runSetup(core: typeof Core, options: SetupOptions): Promise<SetupResult> {
   const steps = core.listGuidepupSetupSteps(options);

   if (steps.length === 0 && !options.json) {
      write(dim('Every setup step was skipped. Running doctor only.'));
   }

   const hooks = options.json ? {} : { onStepStart: announceStep };
   const results = await core.runGuidepupSetup(steps, hooks);
   const outcomes = results.map((result) => toStepOutcome(result));
   const failedStep = outcomes.find((outcome) => outcome.exitCode !== 0);
   if (failedStep) {
      return { steps: outcomes };
   }

   return { steps: outcomes, report: core.createDoctorReport() };
}

function findFailedStep(setupResult: SetupResult): SetupStepOutcome | undefined {
   return setupResult.steps.find((step) => step.exitCode !== 0);
}

function buildExecution(setupResult: SetupResult): CommandExecution {
   const execution: CommandExecution = {
      result: setupResult as unknown as Record<string, unknown>,
   };
   const isEnvironmentFailure =
      findFailedStep(setupResult) !== undefined ||
      (setupResult.report !== undefined && !setupResult.report.ready);
   if (isEnvironmentFailure) {
      execution.exitCode = cliExitCodes.environment;
   }
   return execution;
}

function renderSetupResultText(core: typeof Core, setupResult: SetupResult): string {
   const failedStep = findFailedStep(setupResult);
   if (failedStep) {
      return `${failedStep.command} exited with code ${failedStep.exitCode}. Fix the error above and run a1 setup again.`;
   }
   if (setupResult.report) {
      return core.renderDoctorText(setupResult.report, doctorTextStyle);
   }
   return dim('No setup steps ran.');
}

async function handleSetupAction(options: SetupOptions): Promise<void> {
   const [{ executeCommand }, core] = await Promise.all([
      import('../lib/execute.js'),
      import('#core'),
   ]);

   await executeCommand(
      {
         family: 'setup',
         subcommand: 'setup',
         wcagVersion: undefined,
         json: options.json,
      },
      async () => buildExecution(await runSetup(core, options)),
      (envelope) =>
         renderSetupResultText(core, envelope.result as unknown as SetupResult),
   );
}

export function registerSetupCommand(program: Command): void {
   program
      .command('setup')
      .description(
         'Run the Guidepup setup and install commands this host needs for real screen reader sessions, then re-check with doctor.',
      )
      .option('--json', 'Print JSON instead of human-readable text.')
      .option('--skip-setup', 'Skip the OS permission step (macOS only).')
      .option('--skip-install', 'Skip downloading the screen reader assets.')
      .action(async (options: SetupOptions) => {
         await handleSetupAction(options);
      });
}
