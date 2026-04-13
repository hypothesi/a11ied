import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
   driverFocusResultSchema,
   type DriverFocusResult,
   type DriverFocusTarget,
} from '@a11ied/contracts';

export const focusExecFile = promisify(execFile);
export const FOCUS_COMMAND_TIMEOUT_MS = 5000;

export function escapeAppleScriptString(value: string): string {
   return value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\\"`);
}

export function escapePowerShellString(value: string): string {
   return value.replaceAll("'", "''");
}

export function buildFocusResult(args: {
   status: DriverFocusResult['status'];
   target: DriverFocusTarget;
   platform: DriverFocusResult['platform'];
   details?: string[];
}): DriverFocusResult {
   return driverFocusResultSchema.parse({
      status: args.status,
      target: args.target,
      platform: args.platform,
      details: args.details,
   });
}

export function buildFocusResultFromOutput(args: {
   output: string;
   stderr: string;
   target: DriverFocusTarget;
   platform: DriverFocusResult['platform'];
}): DriverFocusResult {
   if (args.output === 'focused') {
      return buildFocusResult({
         status: 'focused',
         target: args.target,
         platform: args.platform,
      });
   }
   if (args.output === 'not-found') {
      const detail = args.stderr || args.output || 'No matching window found.';
      return buildFocusResult({
         status: 'not-found',
         target: args.target,
         platform: args.platform,
         details: [String(detail)],
      });
   }
   return buildFocusResult({
      status: 'focused',
      target: args.target,
      platform: args.platform,
      details: [args.output].filter((value) => value.length > 0),
   });
}
