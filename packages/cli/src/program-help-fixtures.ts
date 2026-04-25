export interface HelpCase {
   args: string[];
   expected: string;
   name: string;
}

export const topLevelHelpCases: HelpCase[] = [
   {
      name: 'keeps the top-level command split stable',
      args: ['--help'],
      expected: `
      "Usage: a11ied [options] [command]

      CLI-first accessibility automation for VoiceOver, NVDA, and MCP.

      Options:
        -V, --version     output the version number
        -h, --help        display help for command

      Commands:
        wcag              Look up pinned WCAG requirements and coverage data.
        inspect           Explain criterion applicability for a target.
        drive             Control a target screen reader through stable sessions.
        doctor [options]  Report runtime details, browser policy, and supported
                          automation targets.
        run               Execute automated rule scans and named interaction patterns.
        verify            Turn collected evidence into explicit WCAG verification
                          results.
        mcp               Start the MCP stdio server.
        help-all          Print help for the full command tree in one shot.
        help [command]    display help for command
      "
    `,
   },
   {
      name: 'keeps the wcag subcommand grammar stable',
      args: ['wcag', '--help'],
      expected: `
      "Usage: a11ied wcag [options] [command]

      Look up pinned WCAG requirements and coverage data.

      Options:
        -h, --help                      display help for command

      Commands:
        levels [options]                List the available conformance levels.
        criteria [options]              List criteria, optionally filtered to one
                                        conformance level.
        show [options] <criterion>      Show one criterion by id or slug.
        search [options] <query>        Search criterion titles, summaries,
                                        techniques, failures, and tags.
        coverage [options] <criterion>  Show automation coverage and preferred
                                        strategy for one criterion.
        help [command]                  display help for command
      "
    `,
   },
];

export const inspectHelpCases: HelpCase[] = [
   {
      name: 'keeps inspect applicable options stable',
      args: ['inspect', 'applicable', '--help'],
      expected: `
      "Usage: a11ied inspect applicable [options]

      List criteria that look relevant for a target.

      Options:
        --url <url>          Inspect a live URL target.
        --version <version>  Use a specific WCAG version. Defaults to 2.2. (default:
                             "2.2")
        --json               Print JSON instead of human-readable text.
        --verbose            Print more detail in text output.
        -h, --help           display help for command
      "
    `,
   },
];

export const driveRunHelpCases: HelpCase[] = [
   {
      name: 'keeps drive subcommand families stable',
      args: ['drive', '--help'],
      expected: `
      "Usage: a11ied drive [options] [command]

      Control a target screen reader through stable sessions.

      Options:
        -h, --help                    display help for command

      Commands:
        start [options]               Start a persistent driver session.
        status [options]              Show persisted session state and capability
                                      metadata.
        stop [options]                Stop a persistent driver session and remove its
                                      state file.
        next [options]                Move to the next item.
        previous [options]            Move to the previous item.
        key [options]                 Send one or more target-specific key chords.
        type [options]                Type text through the active driver target.
        perform [options] <command>   Perform a named screen-reader command.
        commands [options]            List supported named driver commands.
        focus [options]               Focus a window so the screen reader follows the
                                      right app.
        interact [options]            Enter interaction mode.
        stop-interacting [options]    Leave interaction mode.
        click-current-item [options]  Activate the current item.
        read [options]                Read the current driver state.
        logs [options]                Read captured speech and action logs.
        clear-logs [options]          Clear captured speech and action logs.
        checkpoint [options]          Record a named checkpoint in the current
                                      session.
        help [command]                display help for command
      "
    `,
   },
   {
      name: 'keeps the run subcommand family stable',
      args: ['run', '--help'],
      expected: `
      "Usage: a11ied run [options] [command]

      Execute automated rule scans and named interaction patterns.

      Options:
        -h, --help                     display help for command

      Commands:
        axe [options]                  Run axe-core against a target.
        pattern [options] <patternId>  Run a named built-in interaction pattern.
        help [command]                 display help for command
      "
    `,
   },
   {
      name: 'lists supported drive key tokens',
      args: ['drive', 'key', '--help'],
      expected: `
      "Usage: a11ied drive key [options]

      Send one or more target-specific key chords.

      Options:
        --keys <keys>        Send keys such as VO+ArrowRight or Tab.
        --session <id>       Reuse an existing driver session.
        --target <platform>  Choose one target: voiceover, nvda, or virtual. Defaults
                             to VoiceOver on macOS, NVDA on Windows, or virtual
                             elsewhere. Use --allow-virtual to permit simulation.
        --allow-virtual      Allow the virtual (simulated) screen reader when a real
                             target is available.
        --ephemeral          Run one action in a temporary session and tear it down
                             immediately.
        --json               Print JSON instead of human-readable text.
        --verbose            Print more detail in text output.
        -h, --help           display help for command

      Supported key tokens:
        Chord syntax: join tokens with "+", for example Tab, Shift+Tab, Control+F,
        VO+ArrowRight, or NVDA+N.

        Common:
          Modifiers: Shift, Control, Alt
          Letters: a-z, A-Z, KeyA-KeyZ
          Digits: 0-9, Digit0-Digit9
          Arrows: ArrowUp, ArrowDown, ArrowLeft, ArrowRight
          Arrow aliases: Up, Down, Left, Right, UpArrow, DownArrow, LeftArrow, RightArrow
          Navigation/editing: Backspace, Tab, Enter, Escape, Space, Spacebar, Delete,
            ForwardDelete, Home, End, PageUp, PageDown, Insert, Help, Clear, CapsLock
          Functions: F1-F20
          Punctuation: Backquote, Backtick, Minus, Dash, Equal, Equals, Backslash,
            LeftSquareBracket, RightSquareBracket, SingleQuote, Comma, Period, FullStop,
            Tilde, Plus

        VoiceOver (macOS):
          Modifier aliases: VO (Control+Option), Command, CommandLeft, CommandRight,
            Meta, Option, OptionLeft, OptionRight
          macOS-only keys: Fn, SectionSign, LineFeed, Return, VolumeUp, VolumeDown,
            Mute, Add, Subtract, Multiply, Divide, Decimal
          Examples: VO+ArrowRight, VO+ArrowLeft, VO+Shift+ArrowDown, VO+Space,
            Command+F5

        NVDA (Windows):
          Modifier aliases: NVDA or Nvda (Insert), Windows
          Windows-only keys: Application, Pause, Break, PrintScreen, ScrollLock,
            Numlock, NumPad0, NumPad1, NumPad2, NumPad3, NumPad4, NumPad5, NumPad6,
            NumPad7, NumPad8, NumPad9, NumPadEnter, NumPadDelete, NumPadDivide,
            NumPadMinus, NumPadMultiply, NumPadPlus
          Examples: NVDA+N, NVDA+ArrowDown, NVDA+NumPad5, Control+Alt+N
      "
    `,
   },
];

export const verifyHelpCases: HelpCase[] = [
   {
      name: 'keeps the verify family stable',
      args: ['verify', '--help'],
      expected: `
      "Usage: a11ied verify [options] [command]

      Turn collected evidence into explicit WCAG verification results.

      Options:
        -h, --help                       display help for command

      Commands:
        criterion [options] <criterion>  Verify one WCAG criterion for a target.
        level [options] <level>          Verify a WCAG conformance level against a
                                         target.
        help [command]                   display help for command
      "
    `,
   },
   {
      name: 'keeps verify criterion options stable',
      args: ['verify', 'criterion', '--help'],
      expected: `
   "Usage: a11ied verify criterion [options] <criterion>

   Verify one WCAG criterion for a target.

   Options:
     --url <url>          Run the verification against one live URL target.
     --recording <path>   Write one screen recording to the given .mov or .mp4 path
                          when the target supports it.
     --version <version>  Use a specific WCAG version. Defaults to 2.2. (default:
                          "2.2")
     --target <platform>  Choose one target: voiceover, nvda, or virtual. Defaults
                          to VoiceOver on macOS, NVDA on Windows, or virtual
                          elsewhere. Use --allow-virtual to permit simulation.
     --allow-virtual      Allow the virtual (simulated) screen reader when a real
                          target is available.
     --json               Print JSON instead of human-readable text.
     --verbose            Print more detail in text output.
     -h, --help           display help for command
   "
 `,
   },
   {
      name: 'keeps verify level options stable',
      args: ['verify', 'level', '--help'],
      expected: `
   "Usage: a11ied verify level [options] <level>

   Verify a WCAG conformance level against a target.

   Options:
     --url <url>          Run the verification against one live URL target.
     --recording <path>   Write one screen recording to the given .mov or .mp4 path
                          when the target supports it.
     --version <version>  Use a specific WCAG version. Defaults to 2.2. (default:
                          "2.2")
     --target <platform>  Choose one target: voiceover, nvda, or virtual. Defaults
                          to VoiceOver on macOS, NVDA on Windows, or virtual
                          elsewhere. Use --allow-virtual to permit simulation.
     --allow-virtual      Allow the virtual (simulated) screen reader when a real
                          target is available.
     --json               Print JSON instead of human-readable text.
     --verbose            Print more detail in text output.
     -h, --help           display help for command
   "
 `,
   },
];

export { helpAllExpectations, runOptionCases } from './program-run-help-fixtures.js';
