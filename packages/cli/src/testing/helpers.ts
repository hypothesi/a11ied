import { expect } from 'vitest';

import { EXIT_SUCCESS, EXIT_USAGE, type CliResult, parseJsonOutput } from './setup.js';

interface JsonStateWithLogCursor {
   state: {
      logCursor: number;
   };
}

export function expectJsonLogCursor(
   result: CliResult,
   minimum = 1,
): Record<string, unknown> {
   const json = parseJsonOutput(result.stdout);
   expect(result.status).toBe(EXIT_SUCCESS);
   expect((json.result as JsonStateWithLogCursor).state.logCursor).toBeGreaterThanOrEqual(
      minimum,
   );
   return json;
}

export function expectFirstErrorMessage(args: {
   result: CliResult;
   expectedStatus?: number;
   match: RegExp;
}): Record<string, unknown> {
   const json = parseJsonOutput(args.result.stdout);
   expect(args.result.status).toBe(args.expectedStatus ?? EXIT_USAGE);
   expect((json.errors as Array<{ message: string }>)[0]?.message).toMatch(args.match);
   return json;
}
