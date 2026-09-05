import type { DriverFocusTarget } from '@a11ied/contracts';

import { FOCUS_COMMAND_TIMEOUT_MS, focusExecFile } from './focus-shared.js';
import { delay } from './sequential.js';

const FOCUS_POLL_INTERVAL_MS = 100;
/** How long `sr start` and `sr open` wait for the window to come to the front. */
export const WINDOW_FOCUS_TIMEOUT_MS = 5000;
const FIELD_SEPARATOR = '';

/** What the operating system says is in front right now. */
export interface FrontmostWindow {
   appName?: string | undefined;
   bundleId?: string | undefined;
   processName?: string | undefined;
   pid?: number | undefined;
   windowTitle?: string | undefined;
}

export interface WindowFocusResult {
   focused: boolean;
   frontmost?: FrontmostWindow;
   waitedMs: number;
}

const MAC_FRONTMOST_SCRIPT = [
   'set delim to (ASCII character 30)',
   'tell application "System Events"',
   '  set p to first application process whose frontmost is true',
   '  set n to name of p as text',
   '  set b to ""',
   '  set t to ""',
   '  try',
   '    set b to bundle identifier of p as text',
   '  end try',
   '  try',
   '    set t to name of front window of p as text',
   '  end try',
   '  return n & delim & b & delim & (unix id of p as text) & delim & t',
   'end tell',
].join('\n');

const WINDOWS_FRONTMOST_SCRIPT = [
   'Add-Type @"',
   'using System; using System.Runtime.InteropServices;',
   'public class A11iedFront {',
   '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
   '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
   '}',
   '"@',
   '$h = [A11iedFront]::GetForegroundWindow()',
   '$procId = 0',
   '[void][A11iedFront]::GetWindowThreadProcessId($h, [ref]$procId)',
   '$p = Get-Process -Id $procId -ErrorAction SilentlyContinue',
   `Write-Output ("{0}${FIELD_SEPARATOR}{1}${FIELD_SEPARATOR}{2}" -f $p.ProcessName, $procId, $p.MainWindowTitle)`,
].join('\n');

function stripSuffix(name: string): string {
   return name.replace(/\.(app|exe)$/iu, '').toLowerCase();
}

async function readMacFrontmost(): Promise<FrontmostWindow> {
   const { stdout } = await focusExecFile('osascript', ['-e', MAC_FRONTMOST_SCRIPT], {
      timeout: FOCUS_COMMAND_TIMEOUT_MS,
   });
   const [appName = '', bundleId = '', pid = '', windowTitle = ''] = String(stdout)
      .trim()
      .split(FIELD_SEPARATOR);
   return {
      appName,
      bundleId: bundleId || undefined,
      pid: Number(pid) || undefined,
      windowTitle: windowTitle || undefined,
   };
}

async function readWindowsFrontmost(): Promise<FrontmostWindow> {
   const { stdout } = await focusExecFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_FRONTMOST_SCRIPT],
      { timeout: FOCUS_COMMAND_TIMEOUT_MS },
   );
   const [processName = '', pid = '', windowTitle = ''] = String(stdout)
      .trim()
      .split(FIELD_SEPARATOR);
   return {
      appName: processName,
      processName,
      pid: Number(pid) || undefined,
      windowTitle: windowTitle || undefined,
   };
}

/** Reads the frontmost app and window; undefined where the OS has no such query. */
export async function readFrontmostWindow(): Promise<FrontmostWindow | undefined> {
   try {
      if (process.platform === 'darwin') {
         return await readMacFrontmost();
      }
      if (process.platform === 'win32') {
         return await readWindowsFrontmost();
      }
      return undefined;
   } catch {
      return undefined;
   }
}

function titleMatches(target: DriverFocusTarget, title: string | undefined): boolean {
   if (target.windowTitle === undefined || title === undefined) {
      return false;
   }
   if (target.match === 'exact') {
      return title === target.windowTitle;
   }
   return title.toLowerCase().includes(target.windowTitle.toLowerCase());
}

/** Whether the frontmost window is the one the focus target names. */
export function isFrontmostMatch(
   target: DriverFocusTarget,
   frontmost: FrontmostWindow,
): boolean {
   if (target.pid !== undefined && target.pid === frontmost.pid) {
      return true;
   }
   if (target.bundleId !== undefined && target.bundleId === frontmost.bundleId) {
      return true;
   }
   const names = [target.appName, target.processName].filter(
      (name): name is string => name !== undefined,
   );
   const front = new Set(
      [frontmost.appName, frontmost.processName]
         .filter((name): name is string => name !== undefined)
         .map((name) => stripSuffix(name)),
   );
   if (names.some((name) => front.has(stripSuffix(name)))) {
      return true;
   }
   return titleMatches(target, frontmost.windowTitle);
}

async function pollFocus(
   target: DriverFocusTarget,
   startedAt: number,
   timeoutMs: number,
): Promise<WindowFocusResult> {
   const frontmost = await readFrontmostWindow();
   const waitedMs = Date.now() - startedAt;
   if (frontmost && isFrontmostMatch(target, frontmost)) {
      return { focused: true, frontmost, waitedMs };
   }
   if (waitedMs >= timeoutMs) {
      return frontmost
         ? { focused: false, frontmost, waitedMs }
         : { focused: false, waitedMs };
   }
   await delay(FOCUS_POLL_INTERVAL_MS);
   return pollFocus(target, startedAt, timeoutMs);
}

/**
 * Polls the frontmost window until it is the target or the timeout passes. This replaces
 * a fixed sleep after opening a browser or an app: the reader can only read the window
 * once it is in front.
 */
export async function waitForWindowFocus(
   target: DriverFocusTarget,
   options: { timeoutMs?: number } = {},
): Promise<WindowFocusResult> {
   return pollFocus(target, Date.now(), options.timeoutMs ?? WINDOW_FOCUS_TIMEOUT_MS);
}
