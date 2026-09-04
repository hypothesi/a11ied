import type { Command } from 'commander';
import { cliExitCodes } from '#contracts';
import type * as Core from '#core';
import type { GuidepupSetupStep, GuidepupSetupStepResult } from '#core';
import { code, dim, doctorTextStyle, errorLine, heading } from '../lib/format.js';

interface SetupOptions {
   skipSetup?: boolean;
   skipInstall?: boolean;
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

function reportFailedStep(failed: GuidepupSetupStepResult): void {
   write('');
   write(
      errorLine(
         'setup-step-failed',
         `${failed.step.command} exited with code ${failed.exitCode}. Fix the error above and run a1 setup again.`,
      ),
   );
   process.exitCode = cliExitCodes.environment;
}

async function listSteps(
   options: SetupOptions,
): Promise<GuidepupSetupStep[] | undefined> {
   const [core, { normalizeError }] = await Promise.all([
      import('#core'),
      import('../lib/helpers.js'),
   ]);

   try {
      return core.listGuidepupSetupSteps(options);
   } catch (error) {
      const normalized = normalizeError(error);
      write(
         errorLine(
            normalized.errors[0]?.code ?? 'unknown',
            normalized.errors[0]?.message ?? '',
         ),
      );
      process.exitCode = normalized.exitCode;
      return undefined;
   }
}

function printDoctorReport(core: typeof Core): void {
   const report = core.createDoctorReport();
   write('');
   write(core.renderDoctorText(report, doctorTextStyle));
   if (!report.ready) {
      process.exitCode = cliExitCodes.environment;
   }
}

async function handleSetupAction(options: SetupOptions): Promise<void> {
   const core = await import('#core');
   const steps = await listSteps(options);
   if (!steps) {
      return;
   }

   if (steps.length === 0) {
      write(dim('Every setup step was skipped. Running doctor only.'));
   }

   const results = await core.runGuidepupSetup(steps, { onStepStart: announceStep });
   const failed = results.find((result) => result.exitCode !== 0);
   if (failed) {
      reportFailedStep(failed);
      return;
   }

   printDoctorReport(core);
}

export function registerSetupCommand(program: Command): void {
   program
      .command('setup')
      .description(
         'Run the Guidepup setup and install commands this host needs for real screen reader sessions, then re-check with doctor.',
      )
      .option('--skip-setup', 'Skip the OS permission step (macOS only).')
      .option('--skip-install', 'Skip downloading the screen reader assets.')
      .action(async (options: SetupOptions) => {
         await handleSetupAction(options);
      });
}
