import { spawn } from 'node:child_process';

import {
   createDefaultGuidepupEnvironmentDeps,
   GUIDEPUP_INSTALL_COMMAND,
   GUIDEPUP_SETUP_COMMAND,
   resolveGuidepupInstallRoot,
   type GuidepupEnvironmentDeps,
} from '@a11ied/guidepup';

import { CliEnvironmentError } from '../errors/cli-environment-error.js';

export interface GuidepupSetupStep {
   id: 'setup' | 'install';
   label: string;
   command: string;
   cwd: string;
}

export interface GuidepupSetupOptions {
   skipSetup?: boolean;
   skipInstall?: boolean;
}

export interface GuidepupSetupStepResult {
   step: GuidepupSetupStep;
   exitCode: number;
}

export interface GuidepupSetupHooks {
   onStepStart?: (step: GuidepupSetupStep, index: number, total: number) => void;
}

const installLabelByPlatform: Partial<Record<NodeJS.Platform, string>> = {
   darwin: 'Install the Guidepup VoiceOver preferences bundle',
   win32: 'Install the Guidepup NVDA build',
};

/** Lists the Guidepup commands `a1 setup` runs on this host, in order. */
export function listGuidepupSetupSteps(
   options: GuidepupSetupOptions = {},
   deps: GuidepupEnvironmentDeps = createDefaultGuidepupEnvironmentDeps(),
): GuidepupSetupStep[] {
   const installLabel = installLabelByPlatform[deps.platform];
   if (!installLabel) {
      throw new CliEnvironmentError(
         'setup-unsupported-platform',
         `Real screen reader setup is only available on macOS and Windows. This host is ${deps.platform}.`,
      );
   }
   if (!deps.manifestPath) {
      throw new CliEnvironmentError(
         'guidepup-manifest-missing',
         'Could not resolve @guidepup/guidepup/manifest.json from the a11ied installation.',
      );
   }

   const cwd = resolveGuidepupInstallRoot(deps.manifestPath);
   const steps: GuidepupSetupStep[] = [];

   /*
    * Guidepup's setup command only configures macOS. On Windows it exits without doing
    * anything, so the install step is the whole setup there.
    */
   if (deps.platform === 'darwin' && !options.skipSetup) {
      steps.push({
         id: 'setup',
         label: 'Grant VoiceOver automation permissions',
         command: GUIDEPUP_SETUP_COMMAND,
         cwd,
      });
   }
   if (!options.skipInstall) {
      steps.push({
         id: 'install',
         label: installLabel,
         command: GUIDEPUP_INSTALL_COMMAND,
         cwd,
      });
   }

   return steps;
}

function runStep(step: GuidepupSetupStep): Promise<number> {
   return new Promise((resolveExitCode, reject) => {
      // The Guidepup commands prompt and print progress, so they own the terminal.
      const child = spawn(step.command, { cwd: step.cwd, stdio: 'inherit', shell: true });
      child.on('error', reject);
      child.on('close', (code) => {
         resolveExitCode(code ?? 1);
      });
   });
}

interface StepRun {
   steps: GuidepupSetupStep[];
   index: number;
   hooks: GuidepupSetupHooks;
   results: GuidepupSetupStepResult[];
}

async function runStepsFrom(run: StepRun): Promise<GuidepupSetupStepResult[]> {
   const step = run.steps[run.index];
   if (!step) {
      return run.results;
   }

   run.hooks.onStepStart?.(step, run.index, run.steps.length);
   const exitCode = await runStep(step);
   run.results.push({ step, exitCode });
   if (exitCode !== 0) {
      return run.results;
   }
   return runStepsFrom({ ...run, index: run.index + 1 });
}

/** Runs the setup steps in order, stopping at the first one that exits non-zero. */
export async function runGuidepupSetup(
   steps: GuidepupSetupStep[],
   hooks: GuidepupSetupHooks = {},
): Promise<GuidepupSetupStepResult[]> {
   return runStepsFrom({ steps, index: 0, hooks, results: [] });
}
