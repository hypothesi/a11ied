import { execFile, spawn } from 'node:child_process';
import { sep } from 'node:path';
import { promisify } from 'node:util';
import isInstalledGlobally from 'is-installed-globally';
import { valid as getValidVersion } from 'semver';
import { PACKAGE_NAME } from './constants.js';

export type InstallKind = 'global' | 'npx' | 'project';

const execFileAsync = promisify(execFile);
const NPX_CACHE_SEGMENT = `${sep}_npx${sep}`;
const IS_WINDOWS = process.platform === 'win32';

/** How the copy of a1 that is running now was installed. */
export function getInstallKind(): InstallKind {
   if (isInstalledGlobally) {
      return 'global';
   }

   return import.meta.dirname.includes(NPX_CACHE_SEGMENT) ? 'npx' : 'project';
}

/**
 * The version is checked because it comes from the registry and ends up in a shell
 * command.
 */
export function listGlobalInstallArgs(version: string): readonly string[] {
   const validVersion = getValidVersion(version);

   if (validVersion === null) {
      throw new Error(`"${version}" is not a valid version of ${PACKAGE_NAME}.`);
   }

   return ['install', '--global', `${PACKAGE_NAME}@${validVersion}`];
}

export function formatNpmCommand(args: readonly string[]): string {
   return ['npm', ...args].join(' ');
}

function hasDependency(npmListOutput: string): boolean {
   const parsed: unknown = JSON.parse(npmListOutput);

   return (
      typeof parsed === 'object' &&
      parsed !== null &&
      'dependencies' in parsed &&
      typeof parsed.dependencies === 'object' &&
      parsed.dependencies !== null &&
      PACKAGE_NAME in parsed.dependencies
   );
}

/**
 * True when npm has a global install of a11ied, whether or not it is the copy running
 * now.
 */
export async function hasGlobalInstall(): Promise<boolean> {
   if (isInstalledGlobally) {
      return true;
   }

   try {
      const { stdout } = await execFileAsync(
         'npm',
         ['ls', '--global', '--depth=0', '--json', PACKAGE_NAME],
         { shell: IS_WINDOWS },
      );

      return hasDependency(stdout);
   } catch {
      // `npm ls` exits non-zero when the package is not installed.
      return false;
   }
}

/**
 * Runs npm and resolves with its exit code. With `isJSON`, npm's output goes to stderr so
 * stdout holds only the JSON result.
 */
export function runNpm(args: readonly string[], isJSON = false): Promise<number> {
   return new Promise((resolveExitCode, reject) => {
      // The arguments are fixed strings and a validated version, so a shell is safe here.
      const child = spawn(formatNpmCommand(args), {
         shell: true,
         stdio: isJSON ? ['inherit', process.stderr, 'inherit'] : 'inherit',
      });

      child.on('error', reject);
      child.on('close', (code) => {
         resolveExitCode(code ?? 1);
      });
   });
}
