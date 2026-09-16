import type { DriverFocusResult, DriverFocusTarget } from '@a11ied/contracts';

import {
   FOCUS_COMMAND_TIMEOUT_MS,
   buildFocusResult,
   buildFocusResultFromOutput,
   escapePowerShellString,
   focusExecFile,
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

function buildWindowsFocusLines(args: {
   pidExpression: string;
   processName: string;
   windowTitle: string;
   matchMode: string;
}): string[] {
   return [
      'Add-Type @"',
      'using System; using System.Runtime.InteropServices;',
      'public class A11iedFocus {',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
      '}',
      '"@ -ErrorAction SilentlyContinue',
      `$pid = ${args.pidExpression}`,
      `$processName = '${escapePowerShellString(args.processName)}'`,
      `$windowTitle = '${escapePowerShellString(args.windowTitle)}'`,
      `$matchMode = '${escapePowerShellString(args.matchMode)}'`,
      '$targetId = $null',
      '$proc = $null',
      'if ($pid) { $targetId = $pid }',
      'if (-not $targetId -and $windowTitle) {',
      '  if ($matchMode -eq "contains") {',
      '    $proc = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like ("*" + $windowTitle + "*") } | Select-Object -First 1',
      '    if ($proc) { $targetId = $proc.Id }',
      '  } else {',
      '    $targetId = $windowTitle',
      '  }',
      '}',
      'if (-not $targetId -and $processName) {',
      '  $proc = Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1',
      '  if (-not $proc) {',
      '    $proc = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1',
      '  }',
      '  if ($proc) { $targetId = $proc.Id }',
      '}',
      'if (-not $targetId) {',
      '  Write-Output "not-found"',
      '  exit 0',
      '}',
      'if ($targetId -is [int] -and -not $proc) {',
      '  $proc = Get-Process -Id $targetId -ErrorAction SilentlyContinue | Select-Object -First 1',
      '}',
      'if ($proc -and $proc.MainWindowHandle -ne 0) {',
      '  [void][A11iedFocus]::ShowWindow($proc.MainWindowHandle, 9)',
      '  [void][A11iedFocus]::SetForegroundWindow($proc.MainWindowHandle)',
      '}',
      '$activated = (New-Object -ComObject WScript.Shell).AppActivate($targetId)',
      'if ($activated) {',
      '  Write-Output "focused"',
      '} elseif ($proc -and $proc.MainWindowHandle -ne 0) {',
      '  Write-Output "focused"',
      '} else {',
      '  Write-Output "not-found"',
      '}',
   ];
}

function buildWindowsFocusScript(target: DriverFocusTarget): string {
   const inputs = resolveWindowsFocusInputs(target);
   return buildWindowsFocusLines(inputs).join('\n');
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
