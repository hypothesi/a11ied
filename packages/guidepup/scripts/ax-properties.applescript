try
  set delim to (ASCII character 30)
  tell application "System Events"
    set fe to value of attribute "AXFocusedUIElement" of (first application process whose frontmost is true)
    set r to ""
    set s to ""
    set t to ""
    set d to ""
    set v to ""
    set e to ""
    try
      set r to role of fe as text
    end try
    try
      set s to value of attribute "AXSubrole" of fe as text
    end try
    try
      set t to title of fe as text
    end try
    try
      set d to description of fe as text
    end try
    try
      set v to value of fe as text
    end try
    try
      if enabled of fe then
        set e to "true"
      else
        set e to "false"
      end if
    end try
    return r & delim & s & delim & t & delim & d & delim & v & delim & e
  end tell
on error
  return ""
end try
