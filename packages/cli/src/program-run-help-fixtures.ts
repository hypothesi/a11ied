import type { HelpCase } from './program-help-fixtures.js';

export const runOptionCases: HelpCase[] = [
   {
      name: 'keeps axe options stable',
      args: ['axe', '--help'],
      expected: `
      "Usage: a11ied axe [options] [targets...]

      Run axe-core against one or more targets: an http(s) URL, a file path, - for
      HTML on stdin, or --html.

      Options:
        --level <level>          Limit the run to one WCAG level.
        --criterion <criterion>  Limit the run to one WCAG criterion id or slug.
        --rule <ruleId...>       Limit the run to one or more explicit axe rule ids.
        --selector <css>         Scope the scan to elements matching this CSS
                                 selector.
        --exclude <css>          Exclude elements matching this CSS selector from the
                                 scan.
        --wait-for <css>         Wait for an element matching this CSS selector before
                                 scanning.
        --viewport <WxH>         Set the browser viewport, for example 1280x800.
        --header <header...>     Repeatable. Add a request header, as 'Name: value'.
        --cookie <cookie...>     Repeatable. Add a cookie, as 'name=value'.
        --fail-on <impact>       Only fail on violations at or above this impact:
                                 minor, moderate, serious, or critical. Defaults to
                                 any violation.
        --baseline <file>        JSON file of accepted findings, keyed by rule id and
                                 node target, that do not count toward the exit code.
        --update-baseline        Write the current violations to --baseline instead of
                                 asserting against it.
        --format <format>        Output format: text, json, or sarif. Defaults to text
                                 (json with --json).
        --out <file>             Write the report to this file instead of stdout.
        --wcag <version>         Use a specific WCAG version. Defaults to 2.2.
                                 (default: "2.2")
        --json                   Print JSON instead of human-readable text.
        --verbose                Print more detail in text output.
        --html <markup>          Load inline HTML instead of the positional target.
        --timeout <ms>           Timeout for loading the target, in milliseconds.
                                 Defaults to 10000.
        -h, --help               display help for command
      "
    `,
   },
];

export const helpAllExpectations = [
   'a11ied\n',
   'a11ied wcag\n',
   'a11ied sr start\n',
   'a11ied axe [options] [targets...]\n',
   'a11ied tree [options] [target]\n',
   'a11ied audit [options] [target]\n',
   'a11ied help-all\n',
   '--recording <path>',
];
