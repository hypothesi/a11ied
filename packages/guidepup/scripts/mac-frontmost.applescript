set delim to (ASCII character 30)
tell application "System Events"
  set p to first application process whose frontmost is true
  set n to name of p as text
  set b to ""
  set t to ""
  try
    set b to bundle identifier of p as text
  end try
  try
    set t to name of front window of p as text
  end try
  return n & delim & b & delim & (unix id of p as text) & delim & t
end tell
