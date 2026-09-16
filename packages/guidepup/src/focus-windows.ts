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

const WIN32_FOCUS_CSHARP_SOURCE = [
   'using System;',
   'using System.Text;',
   'using System.Diagnostics;',
   'using System.Runtime.InteropServices;',
   'public class A11iedFocus {',
   '  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);',
   '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);',
   '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);',
   '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);',
   '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);',
   '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
   '  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);',
   '  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();',
   '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
   '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
   '  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);',
   '  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);',
   '  public static bool ForceForeground(IntPtr hWnd) {',
   '    if (hWnd == IntPtr.Zero) return false;',
   '    IntPtr fgWnd = GetForegroundWindow();',
   '    uint fgPid = 0;',
   '    uint fgThread = GetWindowThreadProcessId(fgWnd, out fgPid);',
   '    uint curThread = GetCurrentThreadId();',
   '    if (fgThread != curThread && fgThread != 0) {',
   '      AttachThreadInput(curThread, fgThread, true);',
   '    }',
   '    ShowWindow(hWnd, 9);',
   '    BringWindowToTop(hWnd);',
   '    SwitchToThisWindow(hWnd, true);',
   '    bool res = SetForegroundWindow(hWnd);',
   '    if (fgThread != curThread && fgThread != 0) {',
   '      AttachThreadInput(curThread, fgThread, false);',
   '    }',
   '    return res;',
   '  }',
   '  public static IntPtr FindWindowByPid(int targetPid) {',
   '    if (targetPid <= 0) return IntPtr.Zero;',
   '    IntPtr found = IntPtr.Zero;',
   '    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {',
   '      if (!IsWindowVisible(hWnd)) return true;',
   '      uint pid;',
   '      GetWindowThreadProcessId(hWnd, out pid);',
   '      if (pid == (uint)targetPid) {',
   '        StringBuilder sb = new StringBuilder(256);',
   '        GetWindowText(hWnd, sb, 256);',
   '        if (sb.Length > 0) { found = hWnd; return false; }',
   '      }',
   '      return true;',
   '    }, IntPtr.Zero);',
   '    return found;',
   '  }',
   '  public static IntPtr FindWindowByProcessName(string processName) {',
   '    if (string.IsNullOrEmpty(processName)) return IntPtr.Zero;',
   '    Process[] procs = Process.GetProcessesByName(processName);',
   '    if (procs == null || procs.Length == 0) return IntPtr.Zero;',
   '    IntPtr found = IntPtr.Zero;',
   '    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {',
   '      if (!IsWindowVisible(hWnd)) return true;',
   '      uint pid;',
   '      GetWindowThreadProcessId(hWnd, out pid);',
   '      foreach (Process p in procs) {',
   '        if (pid == (uint)p.Id) {',
   '          StringBuilder sb = new StringBuilder(256);',
   '          GetWindowText(hWnd, sb, 256);',
   '          if (sb.Length > 0) { found = hWnd; return false; }',
   '        }',
   '      }',
   '      return true;',
   '    }, IntPtr.Zero);',
   '    return found;',
   '  }',
   '}',
].join('\n');

function buildTargetResolutionLines(args: {
   pidExpression: string;
   processName: string;
   windowTitle: string;
   matchMode: string;
}): string[] {
   return [
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
   ];
}

function buildForegroundLines(): string[] {
   return [
      'if (-not $targetId) {',
      '  Write-Output "not-found"',
      '  exit 0',
      '}',
      '$targetWnd = [IntPtr]::Zero',
      'if ($targetId -is [int]) {',
      '  $targetWnd = [A11iedFocus]::FindWindowByPid([int]$targetId)',
      '}',
      'if ($targetWnd -eq [IntPtr]::Zero -and $processName) {',
      '  $targetWnd = [A11iedFocus]::FindWindowByProcessName($processName)',
      '}',
      'if ($targetWnd -eq [IntPtr]::Zero -and $proc -and $proc.MainWindowHandle -ne 0) {',
      '  $targetWnd = $proc.MainWindowHandle',
      '}',
      'if ($targetWnd -ne [IntPtr]::Zero) {',
      '  [void][A11iedFocus]::ForceForeground($targetWnd)',
      '}',
      '$activated = (New-Object -ComObject WScript.Shell).AppActivate($targetId)',
      'if ($activated -or $targetWnd -ne [IntPtr]::Zero) {',
      '  Write-Output "focused"',
      '} else {',
      '  Write-Output "not-found"',
      '}',
   ];
}

function buildWindowsFocusLines(args: {
   pidExpression: string;
   processName: string;
   windowTitle: string;
   matchMode: string;
}): string[] {
   return [
      `Add-Type @"\n${WIN32_FOCUS_CSHARP_SOURCE}\n"@ -ErrorAction SilentlyContinue`,
      ...buildTargetResolutionLines(args),
      ...buildForegroundLines(),
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
