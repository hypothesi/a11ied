import type { Command } from 'commander';
import { CliUsageError } from '#core';
import {
   addAllowVirtualOption,
   addJsonOption,
   addPhraseOption,
   addScreenReaderOption,
   addTimeoutOption,
   addVerboseOption,
} from '../lib/options.js';

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
   allowVirtual?: boolean;
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
      addAllowVirtualOption(addScreenReaderOption(command)).option(
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
