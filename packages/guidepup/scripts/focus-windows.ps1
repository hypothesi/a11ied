Add-Type @"
__WIN32_FOCUS_CSHARP__
"@ -ErrorAction SilentlyContinue

$pid = __PID_EXPRESSION__
$processName = '__PROCESS_NAME__'
$windowTitle = '__WINDOW_TITLE__'
$matchMode = '__MATCH_MODE__'
$targetId = $null
$proc = $null
if ($pid) { $targetId = $pid }
if (-not $targetId -and $windowTitle) {
  if ($matchMode -eq "contains") {
    $proc = Get-Process | Where-Object { $_.MainWindowTitle -and $_.MainWindowTitle -like ("*" + $windowTitle + "*") } | Select-Object -First 1
    if ($proc) { $targetId = $proc.Id }
  } else {
    $targetId = $windowTitle
  }
}
if (-not $targetId -and $processName) {
  $proc = Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $proc) {
    $proc = Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -First 1
  }
  if ($proc) { $targetId = $proc.Id }
}
if (-not $targetId) {
  Write-Output "not-found"
  exit 0
}
$targetWnd = [IntPtr]::Zero
if ($targetId -is [int]) {
  $targetWnd = [A11iedFocus]::FindWindowByPid([int]$targetId)
}
if ($targetWnd -eq [IntPtr]::Zero -and $processName) {
  $targetWnd = [A11iedFocus]::FindWindowByProcessName($processName)
}
if ($targetWnd -eq [IntPtr]::Zero -and $proc -and $proc.MainWindowHandle -ne 0) {
  $targetWnd = $proc.MainWindowHandle
}
if ($targetWnd -ne [IntPtr]::Zero) {
  [void][A11iedFocus]::ForceForeground($targetWnd)
}
$activated = (New-Object -ComObject WScript.Shell).AppActivate($targetId)
if ($activated -or $targetWnd -ne [IntPtr]::Zero) {
  Write-Output "focused"
} else {
  Write-Output "not-found"
}
