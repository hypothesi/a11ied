import { describe, expect, it } from 'vitest';

import { buildCli } from './program.js';

function findCommand(
   commandName: string,
): ReturnType<typeof buildCli>['commands'][number] {
   const command = buildCli().commands.find((entry) => entry.name() === commandName);

   if (!command) {
      throw new Error(`expected command "${commandName}" to exist`);
   }

   return command;
}

describe('cli top-level grammar', () => {
   it('keeps the top-level command split stable', () => {
      expect(buildCli().helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied [options] [command]
      
      CLI-first accessibility automation for VoiceOver, NVDA, Storybook, and MCP.
      
      Options:
        -V, --version     output the version number
        -h, --help        display help for command
      
      Commands:
        wcag              Look up pinned WCAG requirements and coverage data.
        inspect           Explain criterion applicability for a target.
        drive             Control a target screen reader through stable sessions.
        doctor [options]  Report runtime details and supported automation targets.
        catalog           List the planned command surface for the CLI.
        run               Execute automated rule scans and named interaction patterns.
        verify            Turn collected evidence into explicit WCAG verification
                          results.
        story             Run a Storybook scenario against a local dev server.
        mcp               Start the MCP stdio server.
        help [command]    display help for command
      "
    `);
   });

   it('keeps the wcag subcommand grammar stable', () => {
      expect(findCommand('wcag').helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied wcag [options] [command]
      
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
    `);
   });
});

describe('cli inspect grammar', () => {
   it('keeps inspect applicable options stable', () => {
      const command = findCommand('inspect').commands.find(
         (entry) => entry.name() === 'applicable',
      );

      expect(command?.helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied inspect applicable [options]
      
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
    `);
   });
});

describe('cli drive and run grammar', () => {
   it('keeps drive and run subcommand families stable', () => {
      expect(findCommand('drive').helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied drive [options] [command]
      
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
    `);

      expect(findCommand('run').helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied run [options] [command]
      
      Execute automated rule scans and named interaction patterns.
      
      Options:
        -h, --help                     display help for command
      
      Commands:
        axe [options]                  Run axe-core against a target.
        pattern [options] <patternId>  Run a named built-in interaction pattern.
        help [command]                 display help for command
      "
    `);
   });
});

function expectVerifyCriterionOptions(
   verifyCommand: ReturnType<typeof findCommand>,
): void {
   const command = verifyCommand.commands.find((entry) => entry.name() === 'criterion');

   expect(command?.helpInformation()).toMatchInlineSnapshot(`
   "Usage: a11lied verify criterion [options] <criterion>

   Verify one WCAG criterion for a target.

   Options:
     --url <url>            Run the verification against one live URL target.
     --storybook-url <url>  Resolve a target from a local Storybook base URL.
     --story-id <storyId>   Resolve one Storybook story by id.
     --version <version>    Use a specific WCAG version. Defaults to 2.2. (default:
                            "2.2")
     --target <platform>    Choose one target: virtual, voiceover, or nvda.
     --json                 Print JSON instead of human-readable text.
     --verbose              Print more detail in text output.
     -h, --help             display help for command
   "
 `);
}

function expectVerifyLevelOptions(verifyCommand: ReturnType<typeof findCommand>): void {
   const command = verifyCommand.commands.find((entry) => entry.name() === 'level');

   expect(command?.helpInformation()).toMatchInlineSnapshot(`
   "Usage: a11lied verify level [options] <level>

   Verify a WCAG conformance level against a target.

   Options:
     --url <url>            Run the verification against one live URL target.
     --storybook-url <url>  Resolve a target from a local Storybook base URL.
     --story-id <storyId>   Resolve one Storybook story by id.
     --version <version>    Use a specific WCAG version. Defaults to 2.2. (default:
                            "2.2")
     --target <platform>    Choose one target: virtual, voiceover, or nvda.
     --json                 Print JSON instead of human-readable text.
     --verbose              Print more detail in text output.
     -h, --help             display help for command
   "
 `);
}

describe('cli verify grammar', () => {
   it('keeps the verify subcommand grammar stable', () => {
      expect(findCommand('verify').helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied verify [options] [command]
      
      Turn collected evidence into explicit WCAG verification results.
      
      Options:
        -h, --help                       display help for command
      
      Commands:
        criterion [options] <criterion>  Verify one WCAG criterion for a target.
        level [options] <level>          Verify a WCAG conformance level against a
                                         target.
        help [command]                   display help for command
      "
    `);

      const verifyCommand = findCommand('verify');
      expectVerifyCriterionOptions(verifyCommand);
      expectVerifyLevelOptions(verifyCommand);
   });
});

describe('cli run options grammar', () => {
   it('keeps run axe options stable', () => {
      const command = findCommand('run').commands.find((entry) => entry.name() === 'axe');

      expect(command?.helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied run axe [options]

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
    `);
   });

   it('keeps run pattern options stable', () => {
      const command = findCommand('run').commands.find(
         (entry) => entry.name() === 'pattern',
      );

      expect(command?.helpInformation()).toMatchInlineSnapshot(`
      "Usage: a11lied run pattern [options] <patternId>

      Run a named built-in interaction pattern.

      Options:
        --url <url>            Run the pattern against one live URL target.
        --storybook-url <url>  Resolve a target from a local Storybook base URL.
        --story-id <storyId>   Resolve one Storybook story by id.
        --session <id>         Reuse an existing driver session.
        --target <platform>    Choose one target: virtual, voiceover, or nvda.
        --json                 Print JSON instead of human-readable text.
        --verbose              Print more detail in text output.
        -h, --help             display help for command
      "
    `);
   });
});
