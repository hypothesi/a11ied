using System;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class A11iedFocus {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr hWnd, bool fAltTab);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool LockSetForegroundWindow(uint uLockCode);
  [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);

  public static bool ForceForeground(IntPtr hWnd) {
    if (hWnd == IntPtr.Zero) return false;
    IntPtr fgWnd = GetForegroundWindow();
    uint fgPid = 0;
    uint fgThread = GetWindowThreadProcessId(fgWnd, out fgPid);
    uint targetPid = 0;
    uint targetThread = GetWindowThreadProcessId(hWnd, out targetPid);
    uint curThread = GetCurrentThreadId();

    try { LockSetForegroundWindow(2); } catch {}
    try { SystemParametersInfo(0x2001, 0, IntPtr.Zero, 0x0003); } catch {}

    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);

    if (fgThread != 0 && targetThread != 0 && fgThread != targetThread) {
      AttachThreadInput(fgThread, targetThread, true);
    }
    if (curThread != 0 && fgThread != 0 && curThread != fgThread) {
      AttachThreadInput(curThread, fgThread, true);
    }

    ShowWindow(hWnd, 9);
    BringWindowToTop(hWnd);
    SwitchToThisWindow(hWnd, true);
    bool res = SetForegroundWindow(hWnd);

    if (!res || GetForegroundWindow() != hWnd) {
      if (fgWnd != IntPtr.Zero && fgWnd != hWnd) {
        ShowWindow(fgWnd, 6);
      }
      ShowWindow(hWnd, 9);
      BringWindowToTop(hWnd);
      SwitchToThisWindow(hWnd, true);
      res = SetForegroundWindow(hWnd);
    }

    if (fgThread != 0 && targetThread != 0 && fgThread != targetThread) {
      AttachThreadInput(fgThread, targetThread, false);
    }
    if (curThread != 0 && fgThread != 0 && curThread != fgThread) {
      AttachThreadInput(curThread, fgThread, false);
    }
    return res;
  }

  public static IntPtr FindWindowByPid(int targetPid) {
    if (targetPid <= 0) return IntPtr.Zero;
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      if (pid == (uint)targetPid) {
        StringBuilder sb = new StringBuilder(256);
        GetWindowText(hWnd, sb, 256);
        StringBuilder cls = new StringBuilder(256);
        GetClassName(hWnd, cls, 256);
        if (sb.Length > 0 || cls.ToString().IndexOf("WidgetWin", StringComparison.OrdinalIgnoreCase) >= 0) {
          found = hWnd; return false;
        }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static IntPtr FindWindowByProcessName(string processName) {
    if (string.IsNullOrEmpty(processName)) return IntPtr.Zero;
    Process[] procs = Process.GetProcessesByName(processName);
    if (procs == null || procs.Length == 0) return IntPtr.Zero;
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
      if (!IsWindowVisible(hWnd)) return true;
      uint pid;
      GetWindowThreadProcessId(hWnd, out pid);
      foreach (Process p in procs) {
        if (pid == (uint)p.Id) {
          StringBuilder sb = new StringBuilder(256);
          GetWindowText(hWnd, sb, 256);
          StringBuilder cls = new StringBuilder(256);
          GetClassName(hWnd, cls, 256);
          if (sb.Length > 0 || cls.ToString().IndexOf("WidgetWin", StringComparison.OrdinalIgnoreCase) >= 0) {
            found = hWnd; return false;
          }
        }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
