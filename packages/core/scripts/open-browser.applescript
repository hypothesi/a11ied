tell application "__APP_NAME__"
  activate
  set targetWindow to make new window
  set URL of active tab of targetWindow to "__URL__"
end tell
