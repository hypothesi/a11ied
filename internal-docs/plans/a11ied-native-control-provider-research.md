# Native control provider findings

Bead `a11lied-j24.52` investigates the dispatch primitives required by T-05,
`a11lied-j24.5`. This research does not establish atomic native input isolation. The user clarified
that ordinary audits use adaptive reader control and observed state; strict
`require-binding` remains optional. Adaptive implementation is tracked in `.53`.

## VoiceOver

The host is macOS 26.5.2. Its VoiceOver scripting dictionary exposes cursor
bounds, text, and magnification, but no underlying accessibility element,
window, or document handle. Its `perform action` command acts on the live
cursor; it accepts no expected element identity. The dictionary is installed
at `/System/Library/CoreServices/VoiceOver.app/Contents/Resources/VoiceOver.sdef`,
lines 51-62 and 176-178.

The installed Guidepup version is 0.33.2. The
[current VoiceOver API](https://www.guidepup.dev/docs/api/class-voiceover)
and [upstream cursor implementation](https://github.com/guidepup/guidepup/blob/d5c9d8059954f214b82689dffcb5866a9b55fe6c/src/macOS/VoiceOver/VoiceOverCursor.ts#L50-L58)
retain live-cursor activation. The
[keyboard dispatcher](https://github.com/guidepup/guidepup/blob/d5c9d8059954f214b82689dffcb5866a9b55fe6c/src/macOS/sendKeys/sendKeys.ts#L20-L27)
activates an application separately from sending its keys. The application
option is an activation request, not a bound window, document, or control.
Typing also enqueues each character separately. A check before the public
method cannot guard the later dispatches.

## Native accessibility alternatives

The macOS SDK supports performing an action on a specified `AXUIElementRef`
and setting an attribute on that element. Those operations can target a
specific control. They do not establish which element VoiceOver is reading
and do not reproduce keyboard traversal or VoiceOver cursor activation.

`CGEventPostToPid` directs an event to a process. It does not bind a window,
browser tab, document, or control within that process.
`AXUIElementPostKeyboardEvent` accepts an application or system-wide element,
not a control, and has been deprecated since macOS 10.9. A native helper that
checks focus and then posts a key would still leave a dispatch race.

These contracts are in the installed macOS SDK: `AXUIElement.h`, lines 207-223,
315-331, and 404-426; `CGEvent.h`, lines 356-374. The action API documents that
a timeout can occur after delivery. Such an action must not be replayed
automatically.

## NVDA

NVDA exposes actual
[focus objects](https://github.com/nvaccess/nvda/blob/c22a509337c0b94ac5459ab2a749eeeb9cb06116/source/api.py#L39-L56)
and [navigator objects](https://github.com/nvaccess/nvda/blob/c22a509337c0b94ac5459ab2a749eeeb9cb06116/source/api.py#L294-L325).
A reader-resident bridge could inspect these identities. The existing
Guidepup relay does not expose them as bound dispatch handles. Its
[queue](https://github.com/guidepup/guidepup/blob/d5c9d8059954f214b82689dffcb5866a9b55fe6c/src/windows/NVDA/NVDAClient.ts#L360-L398)
can send a speech-cancellation key before executing the queued action.
NVDA's [keyboard injection](https://github.com/nvaccess/nvda/blob/c22a509337c0b94ac5459ab2a749eeeb9cb06116/source/keyboardHandler.py#L775-L811)
still uses global key events. Object identity alone does not bind their
destination. A reader-resident bridge needs its own dispatch and acceptance
proof. No Windows runtime test was performed on this macOS host.

## Live host receipt

The first `a1 doctor --strict --json` exited 3 because the existing Guidepup
VoiceOver preferences bundle was missing. `a1 setup --skip-setup --json`
installed that asset and returned a ready VoiceOver target. It skipped the
OS permission setup step. This fixes host readiness, not native binding.

An isolated CLI broker started VoiceOver on the local troubleshooting guide
with `require-binding`. Typing, pressing Enter, and activation each exited 2
with `native-target-binding-unavailable`. After focus moved back to the
original application, typing returned the same refusal. Shutdown exited 0.
A subsequent System Events query confirmed the original application was
foreground and VoiceOver was stopped.

Receipts are in `/private/tmp/a11ied-native-provider-live-DZoQnc/`.
Readiness and setup receipts are
`/private/tmp/a11ied-native-provider-doctor.json` and
`/private/tmp/a11ied-native-provider-setup.json`. This check verifies live
refusal. It does not demonstrate usable bound input or the safety of an
input-enabled session under focus theft.

## Implementation decision

No qualifying atomic VoiceOver primitive was found in the reviewed public APIs.
This finding does not rule out native control. Exact AX actions and an NVDA
bridge remain possible investigations, with different semantics.

The user confirmed on 2026-10-02 that native control plus fresh observations is
sufficient for adaptive testing. T-05 therefore uses observed target checks and
recovery, not an atomic input-isolation prerequisite. Ordinary sessions default
to `guarded`; strict `require-binding` remains optional. Native evidence must
identify the actual session and speech/action artifacts and disclose observation
limits. It must not fabricate cursor identity or substitute simulated output.
