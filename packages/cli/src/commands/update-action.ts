import { cliExitCodes } from '#contracts';
import { CliEnvironmentError } from '#core';
import { PACKAGE_NAME } from '../lib/constants.js';
import { code, dim, symbols } from '../lib/format.js';
import type { CommandExecution } from '../lib/helpers.js';
import {
   formatNpmCommand,
   getInstallKind,
   listGlobalInstallArgs,
   runNpm,
   type InstallKind,
} from '../lib/npm-install.js';
import { askYesNo, canPrompt } from '../lib/prompts.js';
import { checkLatestVersion, type VersionCheck } from '../lib/update-check.js';

export interface UpdateOptions {
   json?: boolean;
   yes?: boolean;
}

interface UpdateResult extends VersionCheck {
   readonly installKind: InstallKind;
   /** The command that installs the latest version, when there is one to install. */
   readonly command: string | undefined;
   readonly isUpdated: boolean;
   /** The npm exit code, when npm ran. */
   readonly npmExitCode: number | undefined;
}

async function fetchVersionCheck(): Promise<VersionCheck> {
   try {
      return await checkLatestVersion();
   } catch (error) {
      throw new CliEnvironmentError(
         'registry-unreachable',
         `Could not get the latest ${PACKAGE_NAME} version from the npm registry: ${error instanceof Error ? error.message : String(error)}`,
      );
   }
}

function formatQuestion(check: VersionCheck, installKind: InstallKind): string {
   if (installKind === 'global') {
      return `Update ${PACKAGE_NAME} ${check.currentVersion} → ${check.latestVersion}?`;
   }

   return `Install ${PACKAGE_NAME} ${check.latestVersion} globally, so a1 runs it from any folder?`;
}

async function shouldInstall(
   options: UpdateOptions,
   check: VersionCheck,
   installKind: InstallKind,
): Promise<boolean> {
   if (options.yes) {
      return true;
   }

   if (!canPrompt(options.json)) {
      return false;
   }

   return askYesNo(formatQuestion(check, installKind));
}

async function runUpdate(options: UpdateOptions): Promise<UpdateResult> {
   const check = await fetchVersionCheck();
   const installKind = getInstallKind();
   const base = { ...check, installKind, isUpdated: false, npmExitCode: undefined };

   if (!check.isUpdateAvailable) {
      return { ...base, command: undefined };
   }

   // A project's own dependency is changed in that project, not here.
   if (installKind === 'project') {
      return { ...base, command: `npm install ${PACKAGE_NAME}@${check.latestVersion}` };
   }

   const args = listGlobalInstallArgs(check.latestVersion);
   const command = formatNpmCommand(args);

   if (!(await shouldInstall(options, check, installKind))) {
      return { ...base, command };
   }

   const npmExitCode = await runNpm(args, options.json);

   return { ...base, command, npmExitCode, isUpdated: npmExitCode === 0 };
}

function toExecution(result: UpdateResult): CommandExecution {
   const isFailed = result.npmExitCode !== undefined && !result.isUpdated;

   return {
      result: { ...result },
      ...(isFailed ? { exitCode: cliExitCodes.environment } : {}),
   };
}

function renderUpdateText(result: UpdateResult): string {
   const { currentVersion, latestVersion, command } = result;

   if (!result.isUpdateAvailable) {
      return `${symbols.pass} ${PACKAGE_NAME} ${currentVersion} is the latest version.`;
   }

   if (result.isUpdated) {
      return `${symbols.pass} Updated ${PACKAGE_NAME} ${currentVersion} → ${latestVersion}.`;
   }

   if (result.npmExitCode !== undefined) {
      return `${symbols.fail} ${command ?? 'npm'} exited with code ${String(result.npmExitCode)}.`;
   }

   const available = `${PACKAGE_NAME} ${latestVersion} is available. You have ${currentVersion}.`;

   if (result.installKind === 'project') {
      return `${available}\nThis copy is a dependency of the project. Update it there: ${code(command ?? '')}`;
   }

   const rerun =
      result.installKind === 'npx'
         ? `npx ${PACKAGE_NAME} update --yes`
         : 'a1 update --yes';

   return `${available}\nRun ${code(rerun)}, or ${code(command ?? '')} ${dim('to install it.')}`;
}

export async function handleUpdateAction(options: UpdateOptions): Promise<void> {
   const { executeCommand } = await import('../lib/execute.js');

   let updateResult: UpdateResult | undefined = undefined;

   await executeCommand(
      {
         family: 'update',
         subcommand: 'update',
         wcagVersion: undefined,
         json: options.json,
      },
      async () => {
         updateResult = await runUpdate(options);
         return toExecution(updateResult);
      },
      () => (updateResult ? renderUpdateText(updateResult) : ''),
   );
}
