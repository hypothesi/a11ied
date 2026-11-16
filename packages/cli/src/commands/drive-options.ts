import type { Command } from 'commander';
import { CliUsageError } from '#core';
import {
   SR_GROUP_HEADINGS,
   getSrCliVerbGroupHeading,
   type SrTaskGroup,
} from '../../../guidepup/src/workflow-registry.js';
import {
   addJsonOption,
   addPhraseOption,
   addScreenReaderOption,
   addTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';

/**
 * The headings that group the sr subcommands in `a1 sr --help`, organized into the 6 N4
 * task groups.
 */
export const DRIVE_GROUPS = {
   session: SR_GROUP_HEADINGS.session,
   navigate: SR_GROUP_HEADINGS.navigate,
   interact: SR_GROUP_HEADINGS.interact,
   assert: SR_GROUP_HEADINGS.assert,
   inspect: SR_GROUP_HEADINGS.inspect,
   bulk: SR_GROUP_HEADINGS.bulk,
   // Legacy aliases for backward compatibility
   read: SR_GROUP_HEADINGS.navigate,
   move: SR_GROUP_HEADINGS.navigate,
   act: SR_GROUP_HEADINGS.interact,
   check: SR_GROUP_HEADINGS.assert,
   other: SR_GROUP_HEADINGS.inspect,
} as const;

export { getSrCliVerbGroupHeading, SR_GROUP_HEADINGS, type SrTaskGroup };

/** Options shared by every sr command that talks to the active session. */
export interface DriveActionOptions {
   json?: boolean;
   verbose?: boolean;
   timeout?: string;
   phrase?: boolean;
}

/** Options for the verbs that start a session when none is active. */
export interface DriveAutoStartOptions extends DriveActionOptions {
   sr?: string;
   ephemeral?: boolean;
}

export function addDriveActionOptions(command: Command): Command {
   return addVerboseOption(addJsonOption(addTimeoutOption(command)));
}

export function addDriveNavigationOptions(command: Command): Command {
   return addDriveActionOptions(addPhraseOption(command));
}

export function addDriveAutoStartOptions(command: Command): Command {
   return addDriveActionOptions(
      addScreenReaderOption(command).option(
         '--ephemeral',
         'Run one action in a temporary session and tear it down immediately.',
      ),
   );
}

/** Parses --timeout into milliseconds, rejecting anything that is not a positive integer. */
export function parseTimeoutMs(value: string | undefined): number | undefined {
   if (value === undefined) {
      return undefined;
   }
   const parsed = Number(value);
   if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new CliUsageError(
         'validation-error',
         '--timeout must be a positive whole number of milliseconds.',
         {
            field: 'timeout',
            value,
         },
      );
   }
   return parsed;
}

/** Parses a non-negative whole number option such as --tail or --idle-timeout. */
export function parseCountOption(
   value: string | undefined,
   field: string,
): number | undefined {
   if (value === undefined) {
      return undefined;
   }
   const parsed = Number(value);
   if (!Number.isInteger(parsed) || parsed < 0) {
      throw new CliUsageError('validation-error', `--${field} must be a whole number.`, {
         field,
         value,
      });
   }
   return parsed;
}
