import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { driverModeSchema, type DriverMode } from '@a11ied/contracts';

/** Overrides the per-user state directory; the test harness sets it per test. */
export const STATE_DIR_ENV_VAR = 'A11IED_STATE_DIR';

/** Selects the driver runtime: `broker` (default, a detached process) or `in-process`. */
export const DRIVER_MODE_ENV_VAR = 'A11IED_DRIVER_MODE';

const { env } = process;

/**
 * Resolves the one per-user directory that holds the active session, its lock, and the
 * broker socket paths: `$A11IED_STATE_DIR`, else `$XDG_STATE_HOME/a11ied`, else
 * `~/.a11ied/state`.
 */
export function resolveStateRoot(): string {
   const override = env[STATE_DIR_ENV_VAR];
   if (override) {
      return resolve(override);
   }
   const xdgStateHome = env.XDG_STATE_HOME;
   if (xdgStateHome) {
      return resolve(xdgStateHome, 'a11ied');
   }
   return resolve(homedir(), '.a11ied', 'state');
}

/** Reads `$A11IED_DRIVER_MODE`; anything but `in-process` means the detached broker. */
export function resolveDriverMode(): DriverMode {
   const parsed = driverModeSchema.safeParse(env[DRIVER_MODE_ENV_VAR]);
   if (parsed.success) {
      return parsed.data;
   }
   return 'broker';
}
