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
return n & delim & b & delim & (processID as text) & delim & t
