Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class A11iedFront {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
}
"@
$h = [A11iedFront]::GetForegroundWindow()
$procId = 0
[void][A11iedFront]::GetWindowThreadProcessId($h, [ref]$procId)
$p = Get-Process -Id $procId -ErrorAction SilentlyContinue
$length = [A11iedFront]::GetWindowTextLength($h) + 1
$title = New-Object System.Text.StringBuilder $length
[void][A11iedFront]::GetWindowText($h, $title, $length)
$result = @{ appName = $p.ProcessName; processName = $p.ProcessName; pid = $procId }
if ($title.Length -gt 0) { $result.windowTitle = $title.ToString() }
$result | ConvertTo-Json -Compress
