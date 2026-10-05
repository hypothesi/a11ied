tell application "__APP_NAME__"
   activate
   if (count of windows) is 0 then
      make new window
   end if
   set targetWindow to front window
   set URL of active tab of targetWindow to "__URL__"
end tell
