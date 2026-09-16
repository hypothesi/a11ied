import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AxFocusedElement } from '@a11ied/contracts';

import { loadPackageScript } from './focus-shared.js';

const execFileAsync = promisify(execFile);
const AX_QUERY_TIMEOUT_MS = 2000;

// ASCII 30 (record separator) — won't appear in any real accessibility property value.
const FIELD_SEPARATOR = '\u001E';
const EXPECTED_FIELD_COUNT = 6;

function loadAxPropertiesScript(): string {
   return loadPackageScript('scripts/ax-properties.applescript', import.meta.url);
}

type AxFields = [string, string, string, string, string, string];

function parseEnabledField(enabledStr: string): boolean | undefined {
   if (enabledStr === 'true') {
      return true;
   }
   if (enabledStr === 'false') {
      return false;
   }
   return undefined;
}

function buildAxResult([role, subrole, title, description, value, enabledStr]: AxFields):
   | AxFocusedElement
   | undefined {
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
   const parts = raw.trim().split(FIELD_SEPARATOR);
   if (parts.length !== EXPECTED_FIELD_COUNT) {
      return undefined;
   }
   return buildAxResult(parts as AxFields);
}

/**
 * Queries the AX properties of the system-focused UI element via System Events. macOS
 * only. Returns undefined on any error or when no element is focused.
 */
export async function queryFocusedAxProperties(): Promise<AxFocusedElement | undefined> {
   try {
      const { stdout } = await execFileAsync(
         'osascript',
         ['-e', loadAxPropertiesScript()],
         {
            timeout: AX_QUERY_TIMEOUT_MS,
         },
      );
      return parseAxOutput(stdout);
   } catch {
      return undefined;
   }
}
