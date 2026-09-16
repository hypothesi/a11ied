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
      "Usage: a1 [options] [command]

      CLI-first accessibility automation for VoiceOver, NVDA, and MCP.

      Options:
        -V, --version     output the version number
        -h, --help        display help for command

      Find and fix problems:
        audit [target]    Scan a page and list what to fix.
        axe [targets...]  Run axe-core against one or more targets.
        tree [target]     Print a page's accessibility tree.

      Drive a screen reader:
        sr                Read a page as VoiceOver, NVDA, or the simulated reader
                          does.

      Look things up:
        wcag [criterion]  Criteria, techniques, axe rules, and the W3C guidance.
        pattern [name]    ARIA patterns: keyboard support and required attributes.
        search <query>    Search WCAG criteria and ARIA patterns together.

      Set up this machine:
        doctor            Check the browser and screen reader setup.
        setup             Install what the screen readers need.

      Other:
        mcp               Serve the MCP tools over stdio.
        help-all          Print every command's help.
        help [command]    display help for command

      Run a1 <command> --help for its options. Every command also takes --json.
      "
    `,
   },
   {
      name: 'keeps the wcag subcommand grammar stable',
      args: ['wcag', '--help'],
      expected: `
      "Usage: a1 wcag [options] [command] [criterion]

      Look up pinned WCAG requirements and test methods.

      Arguments:
        criterion                  Show one criterion by id or slug, or one technique
                                   by id such as G18.

      Options:
        --wcag <version>           Use a specific WCAG version. Defaults to 2.2.
                                   (default: "2.2")
        --json                     Print JSON instead of human-readable text.
        --verbose                  Print more detail in text output.
        -h, --help                 display help for command

      Commands:
        criteria                   List criteria, optionally filtered to one level.
        show <criterion>           Show one criterion with its techniques and
                                   failures.
        understanding <criterion>  Print the full Understanding document for one
                                   criterion.
        rule <ruleId>              Map one axe-core rule id to its WCAG criteria.

      Examples:
        a1 wcag 1.1.1
        a1 wcag rule image-alt
      "
    `,
   },
];

const VOICEOVER_KEY_HELP_SECTION = [
   '        VoiceOver (macOS):',
   '          Modifier aliases: VO (Control+Option), Command, CommandLeft, CommandRight,',
   '            Meta, Option, OptionLeft, OptionRight',
   '          macOS-only keys: Fn, SectionSign, LineFeed, Return, VolumeUp, VolumeDown,',
   '            Mute, Add, Subtract, Multiply, Divide, Decimal',
   '          Examples: VO+ArrowRight, VO+ArrowLeft, VO+Shift+ArrowDown, VO+Space,',
   '            Command+F5',
].join('\n');

const NVDA_KEY_HELP_SECTION = [
   '        NVDA (Windows):',
   '          Modifier aliases: NVDA or Nvda (Insert), Windows',
   '          Windows-only keys: Application, Pause, Break, PrintScreen, ScrollLock,',
   '            Numlock, NumPad0, NumPad1, NumPad2, NumPad3, NumPad4, NumPad5, NumPad6,',
   '            NumPad7, NumPad8, NumPad9, NumPadEnter, NumPadDelete, NumPadDivide,',
   '            NumPadMinus, NumPadMultiply, NumPadPlus',
   '          Examples: NVDA+N, NVDA+ArrowDown, NVDA+NumPad5, Control+Alt+N',
].join('\n');

function resolvePressSrOption(): string {
   if (process.platform === 'win32') {
      return [
         '        --sr <reader>    Screen reader to drive: nvda or virtual. Defaults to an',
         '                         available NVDA target, then falls back to virtual as a',
         '                         last resort. Use --allow-virtual to explicitly request',
         '                         simulation.',
      ].join('\n');
   }
   if (process.platform !== 'darwin') {
      return [
         '        --sr <reader>    Screen reader to drive: voiceover, nvda, or virtual. Defaults',
         '                         to an available VoiceOver or NVDA target, then falls back to',
         '                         virtual as a last resort. Use --allow-virtual to explicitly',
         '                         request simulation.',
      ].join('\n');
   }
   return [
      '        --sr <reader>    Screen reader to drive: voiceover or virtual. Defaults to an',
      '                         available VoiceOver target, then falls back to virtual as a',
      '                         last resort. Use --allow-virtual to explicitly request',
      '                         simulation.',
   ].join('\n');
}

function resolvePressPlatformKeys(): string {
   if (process.platform === 'win32') {
      return NVDA_KEY_HELP_SECTION;
   }
   if (process.platform !== 'darwin') {
      return `${VOICEOVER_KEY_HELP_SECTION}\n\n${NVDA_KEY_HELP_SECTION}`;
   }
   return VOICEOVER_KEY_HELP_SECTION;
}

function resolvePressHelpExpected(): string {
   return `
   "Usage: a1 sr press [options] <chord...>

   Press key chords in order, one chord per argument.

   Options:
${resolvePressSrOption()}
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

${resolvePressPlatformKeys()}
   "
 `;
}

export const driveRunHelpCases: HelpCase[] = [
   {
      name: 'keeps the sr subcommand family stable',
      args: ['sr', '--help'],
      expected: `
      "Usage: a1 sr [options] [command]

      Control a target screen reader through stable sessions.

      Options:
        -h, --help             display help for command

      Start and stop a session:
        start [url]            Start a screen reader session.
        open <url>             Open a page in the active session.
        stop                   Stop the active session.
        status                 Show the active session's target and state.

      Read the current item:
        read                   Read the current item without moving.
        title                  Read the page title.

      Move through the page:
        next [kind]            Move to the next item, or jump by kind.
        previous [kind]        Move to the previous item, or jump by kind.
        top                    Move to the top of the current area or document.
        bottom                 Move to the bottom of the current area or document.
        escape                 Press Escape to dismiss a menu, dialog, or interaction.
        find <text>            Move the cursor to the next place the text appears.
        table <move>           Move or read inside the table the cursor is in.
        goto                   Step forward to an item with a given role or name.
        elements <kind>        List every element of one kind as the reader announces
                               it.
        read-all               Read from the cursor to the end of the document.
        walk [url]             Read a whole page, starting the session if needed.

      Act on it:
        interact               Enter interaction mode for the current group or
                               control.
        stop-interacting       Leave interaction mode.
        activate               Activate the current item.
        press <chord...>       Press key chords in order, one chord per argument.
        type <text>            Type text through the active target.
        do <command>           Run a named screen reader command.
        focus                  Bring a window to the front.

      Check what was said:
        wait                   Pause, or wait until the reader announces a phrase.
        expect <text|/regex/>  Check that the reader announced a phrase.
        checkpoint <label>     Mark a named point in the transcript for --since.
        transcript             Print what the reader said, with timestamps and
                               checkpoints.

      Other:
        screenshot <path>      Save a picture of what the VoiceOver cursor is on.
        batch [file]           Run JSON lines of actions over one session.
        list                   List the named commands sr do accepts.
        help [command]         display help for command

      Examples:
        a1 sr start --sr virtual --allow-virtual
        a1 sr next heading
        a1 sr read
      "
    `,
   },
   {
      name: 'lists supported sr key tokens',
      args: ['sr', 'press', '--help'],
      expected: resolvePressHelpExpected(),
   },
];

export { helpAllExpectations, runOptionCases } from './program-run-help-fixtures.js';
