import type { DriverFocusResult, DriverFocusTarget } from '@a11ied/contracts';

import {
   FOCUS_COMMAND_TIMEOUT_MS,
   buildFocusResult,
   buildFocusResultFromOutput,
   escapePowerShellString,
   focusExecFile,
   loadPackageScript,
} from './focus-shared.js';

function stripSuffix(name: string): string {
   return name.replace(/\.(app|exe)$/iu, '');
}

function resolveWindowsProcessName(target: DriverFocusTarget): string {
   if (target.processName) {
      return stripSuffix(target.processName);
   }
   if (target.appName) {
      return stripSuffix(target.appName);
   }
   return '';
}

function resolveWindowsWindowTitle(target: DriverFocusTarget): string {
   if (target.windowTitle) {
      return target.windowTitle;
   }
   return '';
}

function resolveWindowsMatchMode(target: DriverFocusTarget): string {
   if (target.match) {
      return target.match;
   }
   return 'contains';
}

function resolveWindowsPidExpression(target: DriverFocusTarget): string {
   if (!target.pid) {
      return '$null';
   }
   return `[int]${String(target.pid)}`;
}

function resolveWindowsFocusInputs(target: DriverFocusTarget): {
   pidExpression: string;
   processName: string;
   windowTitle: string;
   matchMode: string;
} {
   return {
      pidExpression: resolveWindowsPidExpression(target),
      processName: resolveWindowsProcessName(target),
      windowTitle: resolveWindowsWindowTitle(target),
      matchMode: resolveWindowsMatchMode(target),
   };
}

function loadWin32FocusSource(): string {
   return loadPackageScript('scripts/win32-focus.cs', import.meta.url);
}

function buildWindowsFocusScript(target: DriverFocusTarget): string {
   const inputs = resolveWindowsFocusInputs(target);
   return loadPackageScript('scripts/focus-windows.ps1', import.meta.url)
      .replace('__WIN32_FOCUS_CSHARP__', loadWin32FocusSource())
      .replace('__PID_EXPRESSION__', inputs.pidExpression)
      .replace('__PROCESS_NAME__', escapePowerShellString(inputs.processName))
      .replace('__WINDOW_TITLE__', escapePowerShellString(inputs.windowTitle))
      .replace('__MATCH_MODE__', escapePowerShellString(inputs.matchMode));
}

export async function focusWindowsTarget(
   target: DriverFocusTarget,
): Promise<DriverFocusResult> {
   try {
      const { stdout, stderr } = await focusExecFile(
         'powershell',
         ['-NoProfile', '-NonInteractive', '-Command', buildWindowsFocusScript(target)],
         { timeout: FOCUS_COMMAND_TIMEOUT_MS },
      );
      return buildFocusResultFromOutput({
         output: String(stdout).trim(),
         stderr: String(stderr ?? ''),
         target,
         platform: 'nvda',
      });
   } catch (error) {
      let message = String(error);
      if (error instanceof Error) {
         message = error.message;
      }
      return buildFocusResult({
         status: 'failed',
         target,
         platform: 'nvda',
         details: [message],
      });
   }
}
