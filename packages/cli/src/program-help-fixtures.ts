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
        sr                Control a target screen reader through stable sessions.
        wcag              Look up pinned WCAG requirements and coverage data.
        axe [options]     Run axe-core against a target.
        inspect           Explain criterion applicability for a target.
        mcp               Start the MCP stdio server.
        doctor [options]  Report runtime details, browser policy, and supported
                          automation targets.
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
      name: 'keeps the sr subcommand family stable',
      args: ['sr', '--help'],
      expected: `
      "Usage: a11ied sr [options] [command]

      Control a target screen reader through stable sessions.

      Options:
        -h, --help                    display help for command

      Commands:
        do [options] <command>        Run a named screen-reader command. Use sr list
                                      for all available commands.
        press [options] <keys>        Send one or more key chords to the screen
                                      reader.
        type [options] <text>         Type text through the active driver target.
        start [options]               Start a persistent driver session. press, type,
                                      and do auto-start a session if none is active.
        stop [options]                Stop a persistent driver session and remove its
                                      state file.
        status [options]              Show persisted session state and capability
                                      metadata.
        focus [options]               Focus a window so the screen reader follows the
                                      right app.
        read [options]                Read the current driver state.
        logs [options]                Read captured speech and action logs.
        clear-logs [options]          Clear captured speech and action logs.
        checkpoint [options] <label>  Record a named checkpoint in the current
                                      session.
        list [options]                List all named commands available for the
                                      current target.
        help [command]                display help for command
      "
    `,
   },
   {
      name: 'lists supported sr key tokens',
      args: ['sr', 'press', '--help'],
      expected: `
      "Usage: a11ied sr press [options] <keys>

      Send one or more key chords to the screen reader.

      Options:
        --session <id>       Reuse an existing screen-reader session. Defaults to the
                             current session or $A11IED_DRIVE_SESSION when available.
        --target <platform>  Choose one target: voiceover or virtual. Defaults to an
                             available VoiceOver target, then falls back to virtual as
                             a last resort. Use --allow-virtual to explicitly request
                             simulation.
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
      "
    `,
   },
];

export { helpAllExpectations, runOptionCases } from './program-run-help-fixtures.js';
