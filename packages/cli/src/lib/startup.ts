const HELP_LIKE_FLAGS = new Set(['-h', '--help', '-V', '--version']);
const HELP_LIKE_COMMANDS = new Set(['help', 'help-all']);
const USER_ARG_OFFSET = 2;

export function shouldSkipStartupMaintenance(argv: string[]): boolean {
   const userArgs = argv.slice(USER_ARG_OFFSET);
   if (userArgs.length === 0) {
      return false;
   }

   if (userArgs.some((entry) => HELP_LIKE_FLAGS.has(entry))) {
      return true;
   }

   const firstNonOption = userArgs.find((entry) => !entry.startsWith('-'));
   if (!firstNonOption) {
      return false;
   }

   return HELP_LIKE_COMMANDS.has(firstNonOption);
}
