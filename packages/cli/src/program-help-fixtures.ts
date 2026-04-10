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

      CLI-first accessibility automation for VoiceOver, NVDA, Storybook, and MCP.

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
        criteria [options]              List criteria for a specific conformance
                                        level.
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
        --url <url>            Inspect a live URL target.
        --storybook-url <url>  Resolve a target from a local Storybook base URL.
        --story-id <storyId>   Resolve one Storybook story by id.
        --version <version>    Use a specific WCAG version. Defaults to 2.2. (default:
                               "2.2")
        --json                 Print JSON instead of human-readable text.
        --verbose              Print more detail in text output.
        -h, --help             display help for command
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
     --url <url>            Run the verification against one live URL target.
     --recording <path>     Write one screen recording to the given .mov or .mp4
                            path when the target supports it.
     --storybook-url <url>  Resolve a target from a local Storybook base URL.
     --story-id <storyId>   Resolve one Storybook story by id.
     --version <version>    Use a specific WCAG version. Defaults to 2.2. (default:
                            "2.2")
     --target <platform>    Choose one target: virtual, voiceover, or nvda.
     --json                 Print JSON instead of human-readable text.
     --verbose              Print more detail in text output.
     -h, --help             display help for command
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
     --url <url>            Run the verification against one live URL target.
     --recording <path>     Write one screen recording to the given .mov or .mp4
                            path when the target supports it.
     --storybook-url <url>  Resolve a target from a local Storybook base URL.
     --story-id <storyId>   Resolve one Storybook story by id.
     --version <version>    Use a specific WCAG version. Defaults to 2.2. (default:
                            "2.2")
     --target <platform>    Choose one target: virtual, voiceover, or nvda.
     --json                 Print JSON instead of human-readable text.
     --verbose              Print more detail in text output.
     -h, --help             display help for command
   "
 `,
   },
];

export const runOptionCases: HelpCase[] = [
   {
      name: 'keeps run axe options stable',
      args: ['run', 'axe', '--help'],
      expected: `
      "Usage: a11ied run axe [options]

      Run axe-core against a target.

      Options:
        --url <url>              Run against one live URL target.
        --level <level>          Limit the run to one WCAG level.
        --criterion <criterion>  Limit the run to one WCAG criterion id or slug.
        --rule <ruleId...>       Limit the run to one or more explicit axe rule ids.
        --storybook-url <url>    Resolve a target from a local Storybook base URL.
        --story-id <storyId>     Resolve one Storybook story by id.
        --version <version>      Use a specific WCAG version. Defaults to 2.2.
                                 (default: "2.2")
        --json                   Print JSON instead of human-readable text.
        --verbose                Print more detail in text output.
        -h, --help               display help for command
      "
    `,
   },
   {
      name: 'keeps run pattern options stable',
      args: ['run', 'pattern', '--help'],
      expected: `
      "Usage: a11ied run pattern [options] <patternId>

      Run a named built-in interaction pattern.

      Options:
        --url <url>            Run the pattern against one live URL target.
        --recording <path>     Write one screen recording to the given .mov or .mp4
                               path when the target supports it.
        --storybook-url <url>  Resolve a target from a local Storybook base URL.
        --story-id <storyId>   Resolve one Storybook story by id.
        --session <id>         Reuse an existing driver session.
        --target <platform>    Choose one target: virtual, voiceover, or nvda.
        --json                 Print JSON instead of human-readable text.
        --verbose              Print more detail in text output.
        -h, --help             display help for command
      "
    `,
   },
];

export const helpAllExpectations = [
   '# a11ied',
   '# a11ied wcag',
   '# a11ied inspect applicable',
   '# a11ied drive start',
   '# a11ied run axe',
   '# a11ied verify criterion',
   '# a11ied help-all',
   '--storybook-url <url>',
   '--recording <path>',
];
