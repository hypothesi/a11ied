import { readFile, writeFile } from 'node:fs/promises';

import { axeBaselineSchema, type AxeBaseline } from '#contracts';
import { CliEnvironmentError, CliUsageError } from '#core';

const BASELINE_INDENT = 2;

function toCauseMessage(error: unknown): string {
   if (error instanceof Error) {
      return error.message;
   }
   return String(error);
}

async function readBaselineFile(path: string): Promise<string> {
   try {
      return await readFile(path, 'utf8');
   } catch (error) {
      throw new CliEnvironmentError(
         'baseline-unavailable',
         `Could not read baseline "${path}".`,
         { path, cause: toCauseMessage(error) },
      );
   }
}

function parseBaselineJson(path: string, raw: string): unknown {
   try {
      return JSON.parse(raw);
   } catch (error) {
      throw new CliUsageError(
         'invalid-baseline',
         `Baseline "${path}" is not valid JSON.`,
         { path, cause: toCauseMessage(error) },
      );
   }
}

/** Reads and validates a baseline file written by `a1 axe --update-baseline`. */
export async function readAxeBaseline(path: string): Promise<AxeBaseline> {
   const raw = await readBaselineFile(path);
   const parsedJson = parseBaselineJson(path, raw);
   const result = axeBaselineSchema.safeParse(parsedJson);
   if (!result.success) {
      throw new CliUsageError(
         'invalid-baseline',
         `Baseline "${path}" does not match the expected shape.`,
         { path },
      );
   }
   return result.data;
}

/** Writes one baseline file for `a1 axe --update-baseline`. */
export async function writeAxeBaseline(
   path: string,
   baseline: AxeBaseline,
): Promise<void> {
   const contents = `${JSON.stringify(baseline, undefined, BASELINE_INDENT)}\n`;
   try {
      await writeFile(path, contents, 'utf8');
   } catch (error) {
      throw new CliEnvironmentError(
         'baseline-unavailable',
         `Could not write baseline "${path}".`,
         { path, cause: toCauseMessage(error) },
      );
   }
}
