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
        -V, --version               output the version number
        -h, --help                  display help for command

      Commands:
        sr                          Control a target screen reader through stable
                                    sessions.
        wcag                        Look up pinned WCAG requirements and coverage
                                    data.
        axe [options] [targets...]  Run axe-core against one or more targets: an
                                    http(s) URL, a file path, - for HTML on stdin, or
                                    --html.
        tree [options] [target]     Print the accessibility tree for a target: an
                                    http(s) URL, a file path, - for HTML on stdin, or
                                    --html.
        audit [options] [target]    Run the full audit loop against a target: axe, an
                                    accessibility tree summary, WCAG applicability,
                                    and a criterion rollup.
        mcp                         Start the MCP stdio server.
        doctor [options]            Check this machine for browser and screen reader
                                    readiness, and list the setup steps still needed.
        setup [options]             Run the Guidepup setup and install commands this
                                    host needs for real screen reader sessions, then
                                    re-check with doctor.
        help-all                    Print help for the full command tree in one shot.
        help [command]              display help for command
      "
    `,
   },
   {
      name: 'keeps the wcag subcommand grammar stable',
      args: ['wcag', '--help'],
      expected: `
      "Usage: a11ied wcag [options] [command] [criterion]

      Look up pinned WCAG requirements and coverage data.

      Arguments:
        criterion                   Show one criterion by id or slug, or one technique
                                    by id such as G18.

      Options:
        --version <version>         Use a specific WCAG version. Defaults to 2.2.
                                    (default: "2.2")
        --json                      Print JSON instead of human-readable text.
        --verbose                   Print more detail in text output.
        -h, --help                  display help for command

      Commands:
        criteria [options]          List criteria, optionally filtered to one
                                    conformance level.
        show [options] <criterion>  Show one criterion by id or slug with its
                                    techniques, failures, and coverage.
        search [options] <query>    Search criterion titles, summaries, techniques,
                                    failures, and tags.
        rule [options] <ruleId>     Map one axe-core rule id to its criteria,
                                    techniques, failures, and fix guidance.
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
        -h, --help                       display help for command

      Commands:
        start [options] [url]            Start the screen reader session, replacing
                                         any active one. press, type, and do start one
                                         when none is active.
        open [options] <url>             Navigate the active session to a page.
                                         Virtual loads the document; VoiceOver and
                                         NVDA open the system browser and refocus it.
        stop [options]                   Stop the active session. A transcript is
                                         written next to any recording; --out writes
                                         one as .json or .md.
        status [options]                 Show the active session: target, URL, uptime,
                                         recording, and transcript counts.
        read [options]                   Read the current item without moving: role,
                                         name, value, states, and the phrase, with the
                                         source of each.
        title [options]                  Read the page title: document.title on
                                         virtual, the window summary on VoiceOver, the
                                         window title on NVDA.
        next [options] [kind]            Move to the next item, or jump by kind: item,
                                         heading, link, landmark, control, button,
                                         table, list, graphic, region, form-field.
        previous [options] [kind]        Move to the previous item, or jump by kind:
                                         item, heading, link, landmark, control,
                                         button, table, list, graphic, region,
                                         form-field.
        interact [options]               Enter interaction mode for the current group
                                         or control.
        stop-interacting [options]       Leave interaction mode.
        activate [options]               Activate the current item.
        top [options]                    Move to the top of the current area or
                                         document.
        bottom [options]                 Move to the bottom of the current area or
                                         document.
        escape [options]                 Press Escape to dismiss a menu, dialog, or
                                         interaction.
        find [options] <text>            Move the cursor to the next place the text
                                         appears. Exits 4 when it is not found.
        table [options] <move>           Move inside the table the cursor is in, or
                                         read a header: next-cell, previous-cell,
                                         next-row, previous-row, next-column,
                                         previous-column, row-header, column-header.
        goto [options]                   Step forward until the current item has the
                                         given role, name, or both. Exits 4 when
                                         nothing matches.
        elements [options] <kind>        The rotor: move to the top, then list every
                                         element of one kind as the reader announces
                                         it. Kinds: heading, link, landmark, control,
                                         button, table, list, graphic, region,
                                         form-field.
        read-all [options]               Say-all as a transcript: step item by item
                                         from the cursor to the end of the document,
                                         bounded by --max.
        walk [options] [url]             Read the whole page top to bottom and print
                                         the transcript. Starts a session when none is
                                         active; with a URL, opens that page first.
        press [options] <chord...>       Press key chords in order, one chord per
                                         argument.
        type [options] <text>            Type text through the active target.
        do [options] <command>           Run a named screen-reader command. Use sr
                                         list for all available commands.
        focus [options]                  Bring a window to the front. With no options,
                                         refocus the app the session opened.
        screenshot [options] <path>      Save a picture of what the VoiceOver cursor
                                         is on to the path. NVDA and the virtual
                                         reader have no cursor screenshot and exit 2.
        wait [options]                   Pause, or wait until the reader announces a
                                         phrase. Polls the transcript, so a phrase
                                         that arrives between two commands is not
                                         missed. Exits 4 on timeout.
        expect [options] <text|/regex/>  Check that the reader announced a phrase.
                                         Exits 4 when it did not, or with --not when
                                         it did.
        checkpoint [options] <label>     Mark a named point in the transcript for
                                         --since.
        transcript [options]             Print what the reader said, with timestamps
                                         and checkpoints.
        batch [options] [file]           Run JSON lines of actions, one per line, over
                                         one broker connection in one process. Reads
                                         stdin when no file is given. Stops at the
                                         first failed expect unless --continue.
        list [options]                   List the named commands sr do accepts,
                                         grouped by command set and by what they do.
                                         Start with --query; the full list is over 400
                                         lines.
        help [command]                   display help for command
      "
    `,
   },
   {
      name: 'lists supported sr key tokens',
      args: ['sr', 'press', '--help'],
      expected: `
      "Usage: a11ied sr press [options] <chord...>

      Press key chords in order, one chord per argument.

      Options:
        --sr <reader>    Screen reader to drive: voiceover or virtual. Defaults to an
                         available VoiceOver target, then falls back to virtual as a
                         last resort. Use --allow-virtual to explicitly request
                         simulation.
        --allow-virtual  Allow the virtual (simulated) screen reader when a real
                         target is available.
        --ephemeral      Run one action in a temporary session and tear it down
                         immediately.
        --timeout <ms>   Bound the screen reader command in milliseconds instead of
                         using the built-in limits.
        --json           Print JSON instead of human-readable text.
        --verbose        Print more detail in text output.
        --phrase         Print only the last spoken phrase, one line, for shell loops.
        -h, --help       display help for command

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
