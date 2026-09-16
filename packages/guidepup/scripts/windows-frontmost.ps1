Add-Type @"
using System; using System.Runtime.InteropServices;
public class A11iedFront {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
}
"@
$h = [A11iedFront]::GetForegroundWindow()
$procId = 0
[void][A11iedFront]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
Write-Output ("{0} {1} {2}" -f $p.ProcessName, $procId, $p.MainWindowTitle)
