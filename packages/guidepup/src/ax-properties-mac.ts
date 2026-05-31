import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { AxFocusedElement } from '@a11ied/contracts';

const execFileAsync = promisify(execFile);
const AX_QUERY_TIMEOUT_MS = 2000;

// ASCII 30 (record separator) — won't appear in any real accessibility property value.
const FIELD_SEPARATOR = '\u001E';
const EXPECTED_FIELD_COUNT = 6;

// Sequoia-compatible (avoids error -2741 from `focused UI element` syntax on macOS 15+).
const SCRIPT = [
   'try',
   `  set delim to (ASCII character 30)`,
   '  tell application "System Events"',
   '    set fe to value of attribute "AXFocusedUIElement" of (first application process whose frontmost is true)',
   '    set r to ""',
   '    set s to ""',
   '    set t to ""',
   '    set d to ""',
   '    set v to ""',
   '    set e to ""',
   '    try',
   '      set r to role of fe as text',
   '    end try',
   '    try',
   '      set s to value of attribute "AXSubrole" of fe as text',
   '    end try',
   '    try',
   '      set t to title of fe as text',
   '    end try',
   '    try',
   '      set d to description of fe as text',
   '    end try',
   '    try',
   '      set v to value of fe as text',
   '    end try',
   '    try',
   '      if enabled of fe then',
   '        set e to "true"',
   '      else',
   '        set e to "false"',
   '      end if',
   '    end try',
   '    return r & delim & s & delim & t & delim & d & delim & v & delim & e',
   '  end tell',
   'on error',
   '  return ""',
   'end try',
].join('\n');

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
      const { stdout } = await execFileAsync('osascript', ['-e', SCRIPT], {
         timeout: AX_QUERY_TIMEOUT_MS,
      });
      return parseAxOutput(stdout);
   } catch {
      return undefined;
   }
}
