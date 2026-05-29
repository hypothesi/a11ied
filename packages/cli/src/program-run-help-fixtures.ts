import type { HelpCase } from './program-help-fixtures.js';

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
        --url <url>          Run the pattern against one live URL target.
        --recording <path>   Write one screen recording to the given .mov or .mp4 path
                             when the target supports it.
        --session <id>       Reuse an existing screen-reader session. Defaults to the
                             current session or $A11IED_DRIVE_SESSION when available.
        --target <platform>  Choose one target: voiceover, nvda, or virtual. Defaults
                             to an available VoiceOver or NVDA target, then falls back
                             to virtual as a last resort. Use --allow-virtual to
                             explicitly request simulation.
        --allow-virtual      Allow the virtual (simulated) screen reader when a real
                             target is available.
        --json               Print JSON instead of human-readable text.
        --verbose            Print more detail in text output.
        -h, --help           display help for command

      Run "a1 run patterns" to list all available pattern IDs.
      "
    `,
   },
];

export const helpAllExpectations = [
   'a11ied\n',
   'a11ied wcag\n',
   'a11ied inspect applicable\n',
   'a11ied session start\n',
   'a11ied run axe\n',
   'a11ied run patterns\n',
   'a11ied help-all\n',
   '--recording <path>',
];
