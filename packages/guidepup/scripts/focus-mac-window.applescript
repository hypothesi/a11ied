set targetTitle to "__WINDOW_TITLE__"
set targetMatch to "__MATCH__"
set targetAppName to "__APP_NAME__"
set targetBundleId to "__BUNDLE_ID__"
set matched to false
tell application "System Events"
  repeat with p in processes
    if matched then exit repeat
    set isCandidate to true
    if targetAppName is not "" then
      if name of p is not targetAppName then
        set isCandidate to false
      end if
    end if
    if targetBundleId is not "" then
      try
        if bundle identifier of p is not targetBundleId then
          set isCandidate to false
        end if
      on error
        set isCandidate to false
      end try
    end if
    if isCandidate then
      try
        repeat with w in windows of p
          set wname to name of w
          if targetMatch is "exact" then
            if wname is targetTitle then
              set frontmost of p to true
              set matched to true
              exit repeat
            end if
          else
            if wname contains targetTitle then
              set frontmost of p to true
              set matched to true
              exit repeat
            end if
          end if
          if matched then exit repeat
        end repeat
      end try
    end if
  end repeat
end tell
if matched then return "focused" else return "not-found"
