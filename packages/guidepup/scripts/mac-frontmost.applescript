use framework "AppKit"
use scripting additions

set foregroundApplication to current application's NSWorkspace's sharedWorkspace()'s frontmostApplication()
if foregroundApplication is missing value then return ""
set n to ""
set b to ""
set foregroundName to foregroundApplication's localizedName()
set foregroundBundle to foregroundApplication's bundleIdentifier()
if foregroundName is not missing value then set n to foregroundName as text
if foregroundBundle is not missing value then set b to foregroundBundle as text
set processID to foregroundApplication's processIdentifier() as integer
set delim to (ASCII character 30)
set t to ""
tell application "System Events"
  try
    set p to first application process whose unix id is processID
    set t to name of front window of p as text
  end try
end tell
set workspaceRecord to n & delim & b & delim & (processID as text) & delim & t
if b is "com.apple.VoiceOver" or b is "com.apple.AccessibilityVisualsAgent" then
  tell application "System Events"
    try
      set inputProcess to first application process whose frontmost is true
      set inputName to name of inputProcess as text
      set inputBundle to bundle identifier of inputProcess as text
      set inputID to unix id of inputProcess as integer
      set inputTitle to ""
      try
        set inputTitle to name of front window of inputProcess as text
      end try
      return workspaceRecord & (ASCII character 29) & inputName & delim & inputBundle & delim & (inputID as text) & delim & inputTitle
    end try
  end tell
end if
return workspaceRecord
