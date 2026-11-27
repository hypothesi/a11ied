import chalk from 'chalk';
import { gt as isGreaterVersion } from 'semver';
import updateNotifier, { type UpdateNotifier } from 'update-notifier';
import { CLI_VERSION, PACKAGE_NAME } from './constants.js';
import { getInstallKind } from './npm-install.js';

export interface VersionCheck {
   readonly currentVersion: string;
   readonly latestVersion: string;
   readonly isUpdateAvailable: boolean;
}

const UPDATE_HINTS = {
   global: 'a1 update',
   npx: `npx ${PACKAGE_NAME}@latest`,
   project: `npm install ${PACKAGE_NAME}@latest`,
} as const;

function createNotifier(): UpdateNotifier {
   return updateNotifier({ pkg: { name: PACKAGE_NAME, version: CLI_VERSION } });
}

/** What a person runs to update the copy of a1 that is running now. */
export function getUpdateHint(): string {
   return UPDATE_HINTS[getInstallKind()];
}

/**
 * False in CI, in tests, and when `NO_UPDATE_NOTIFIER` is set. update-notifier creates no
 * config store in those cases, so its absence is the signal.
 */
export function isUpdateCheckEnabled(): boolean {
   return createNotifier().config !== undefined;
}

/**
 * Prints a short notice to stderr as the process exits, if the last daily check found a
 * newer version. That check runs in a detached process, so this adds no wait. Nothing is
 * printed when stdout is not a terminal.
 */
export function scheduleUpdateNotice(): void {
   createNotifier().notify({
      message: `Update available ${chalk.dim('{currentVersion}')} → ${chalk.green('{latestVersion}')}\nRun ${chalk.cyan(getUpdateHint())}`,
      boxenOptions: {
         borderColor: 'yellow',
         borderStyle: 'round',
         margin: { top: 1, bottom: 0, left: 0, right: 0 },
         padding: { top: 0, bottom: 0, left: 1, right: 1 },
      },
   });
}

/** Asks the npm registry for the latest version now, without the daily cache. */
export async function checkLatestVersion(): Promise<VersionCheck> {
   const info = await createNotifier().fetchInfo();

   return {
      currentVersion: info.current,
      latestVersion: info.latest,
      isUpdateAvailable: isGreaterVersion(info.latest, info.current),
   };
}
