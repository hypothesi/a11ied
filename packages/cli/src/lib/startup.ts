const HELP_LIKE_FLAGS = new Set(['-h', '--help', '-V', '--version']);
const HELP_LIKE_COMMANDS = new Set(['help', 'help-all']);
const HELP_FLAGS = new Set(['-h', '--help']);
const VERSION_FLAGS = new Set(['-V', '--version']);
const UPDATE_NOTICE_COMMANDS = new Set(['doctor', 'help', 'help-all']);
const USER_ARG_OFFSET = 2;

function findCommandName(userArgs: readonly string[]): string | undefined {
   return userArgs.find((entry) => !entry.startsWith('-'));
}

export function shouldSkipStartupMaintenance(argv: string[]): boolean {
   const userArgs = argv.slice(USER_ARG_OFFSET);
   if (userArgs.length === 0) {
      return false;
   }

   if (userArgs.some((entry) => HELP_LIKE_FLAGS.has(entry))) {
      return true;
   }

   const firstNonOption = findCommandName(userArgs);
   if (!firstNonOption) {
      return false;
   }

   return HELP_LIKE_COMMANDS.has(firstNonOption);
}

/**
 * Only bare `a1`, help, and `doctor` show the update notice. Output that scripts read,
 * such as `--json` and `--version`, never gets it.
 */
export function shouldShowUpdateNotice(argv: string[]): boolean {
   const userArgs = argv.slice(USER_ARG_OFFSET);
   const isMachineReadable = userArgs.some(
      (entry) => entry === '--json' || VERSION_FLAGS.has(entry),
   );

   if (isMachineReadable) {
      return false;
   }

   if (userArgs.length === 0 || userArgs.some((entry) => HELP_FLAGS.has(entry))) {
      return true;
   }

   return UPDATE_NOTICE_COMMANDS.has(findCommandName(userArgs) ?? '');
}
