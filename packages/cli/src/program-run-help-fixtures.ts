import type { HelpCase } from './program-help-fixtures.js';

export const runOptionCases: HelpCase[] = [
   {
      name: 'keeps axe options stable',
      args: ['axe', '--help'],
      expected: `
      "Usage: a11ied axe [options]

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
];

export const helpAllExpectations = [
   'a11ied\n',
   'a11ied wcag\n',
   'a11ied inspect applicable\n',
   'a11ied sr start\n',
   'a11ied axe\n',
   'a11ied help-all\n',
   '--recording <path>',
];
