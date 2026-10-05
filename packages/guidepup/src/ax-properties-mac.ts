import { z } from 'zod';

import type { AxFocusedElement } from '@a11ied/contracts';

import { DriverCommandError } from './driver-command-error.js';
import { focusExecFile, loadPackageScript } from './focus-shared.js';

const AX_QUERY_TIMEOUT_MS = 2000;

// The record separator distinguishes empty AX attributes from missing focus.
const FIELD_SEPARATOR = '\u001E';
const axFieldsSchema = z.tuple([
   z.string(),
   z.string(),
   z.string(),
   z.string(),
   z.string(),
   z.enum(['', 'true', 'false']),
]);

function loadAxPropertiesScript(): string {
   return loadPackageScript('scripts/ax-properties.applescript', import.meta.url);
}

function parseEnabledField(enabledStr: string): boolean | undefined {
   if (enabledStr === 'true') {
      return true;
   }
   if (enabledStr === 'false') {
      return false;
   }
   return undefined;
}

function buildAxResult([role, subrole, title, description, value, enabledStr]: z.infer<
   typeof axFieldsSchema
>): AxFocusedElement | undefined {
   const enabled = parseEnabledField(enabledStr);
   const result: AxFocusedElement = {
      ...(role && { role }),
      ...(subrole && { subrole }),
      ...(title && { title }),
      ...(description && { description }),
      ...(value && { value }),
      ...(enabled !== undefined && { enabled }),
   };
   return Object.keys(result).length > 0 ? result : undefined;
}

function parseAxOutput(raw: string): AxFocusedElement | undefined {
   if (raw.trim().length === 0) {
      return undefined;
   }
   const parsed = axFieldsSchema.safeParse(raw.trimEnd().split(FIELD_SEPARATOR));
   if (!parsed.success) {
      throw new DriverCommandError(
         'keyboard-focus-invalid-response',
         'The macOS keyboard-focus query returned an invalid property record.',
         {},
      );
   }
   return buildAxResult(parsed.data);
}

/**
 * Queries the AX properties of the system-focused UI element via System Events. macOS
 * only. Returns undefined when no focus properties are available. Query failures
 * propagate so callers can distinguish unavailable focus from permission or OS errors.
 */
export async function queryFocusedAxProperties(): Promise<AxFocusedElement | undefined> {
   const { stdout } = await focusExecFile('osascript', ['-e', loadAxPropertiesScript()], {
      timeout: AX_QUERY_TIMEOUT_MS,
   });
   return parseAxOutput(String(stdout));
}
