import { describe, expect, it } from 'vitest';

import {
   SR_GROUP_HEADINGS,
   SR_TASK_GROUPS,
   SR_VERB_REGISTRY,
} from '../../guidepup/src/workflow-registry.js';
import {
   driveRunHelpCases,
   helpAllExpectations,
   type HelpCase,
   runOptionCases,
   topLevelHelpCases,
} from './program-help-fixtures.js';
import { buildCli } from './program.js';
import { EXIT_SUCCESS, runCli } from './testing/setup.js';

function resolveMinIndent(indents: number[]): number {
   if (indents.length === 0) {
      return 0;
   }
   return Math.min(...indents);
}

function dedentHelpFixture(expected: string): string {
   const content = expected.replace(/^\s*"/, '').replace(/"\s*$/, '');
   const lines = content.split('\n');
   const [firstLine, ...restLines] = lines;
   const indents = restLines
      .filter((line) => line.trim().length > 0)
      .map((line) => line.match(/^(\s*)/)?.[0].length ?? 0);
   const minIndent = resolveMinIndent(indents);
   return [firstLine ?? '', ...restLines.map((line) => line.slice(minIndent))].join('\n');
}

async function expectHelp(helpCase: HelpCase): Promise<void> {
   const result = await runCli(helpCase.args);

   expect(result.status).toBe(EXIT_SUCCESS);
   expect(result.stdout.trimEnd()).toBe(dedentHelpFixture(helpCase.expected).trimEnd());
}

function registerHelpCases(suiteName: string, helpCases: HelpCase[]): void {
   describe(suiteName, () => {
      for (const helpCase of helpCases) {
         it(helpCase.name, async () => {
            await expectHelp(helpCase);
         });
      }
   });
}

registerHelpCases('cli top-level grammar', topLevelHelpCases);
registerHelpCases('cli sr grammar', driveRunHelpCases);
registerHelpCases('cli command options grammar', runOptionCases);

describe('cli aggregate help', () => {
   it('prints the full command tree in one shot', async () => {
      const result = await runCli(['help-all']);

      expect(result.status).toBe(EXIT_SUCCESS);
      for (const line of helpAllExpectations) {
         expect(result.stdout).toContain(line);
      }
   });
});

describe('cli sr command listing', () => {
   it('lists supported driver commands without requiring a session', async () => {
      const result = await runCli([
         'sr',
         'list',
         '--sr',
         'voiceover',
         '--command-set',
         'voiceover-commander',
         '--query',
         'move-right',
      ]);

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(result.stdout).toContain('VoiceOver — Commander');
      expect(result.stdout).toContain('move-right');
      expect(result.stdout).toContain('move right');
   });

   it('lists only the portable verbs for the virtual screen reader', async () => {
      const result = await runCli(['sr', 'list', '--sr', 'virtual']);

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(result.stdout).toContain('Portable');
      expect(result.stdout).toContain('stop-interacting');
      expect(result.stdout).not.toContain('VoiceOver — Commander');
   });
});

describe('cli sr N4 task group organisation', () => {
   it('renders all six N4 group headings in a1 sr --help', async () => {
      const result = await runCli(['sr', '--help']);
      expect(result.status).toBe(EXIT_SUCCESS);
      for (const group of SR_TASK_GROUPS) {
         const heading = SR_GROUP_HEADINGS[group];
         expect(result.stdout).toContain(heading);
      }
   });

   it('assigns every registered sr subcommand to its matching group heading from SR_VERB_REGISTRY', async () => {
      const program = buildCli();
      const srCommand = program.commands.find((command) => command.name() === 'sr');
      expect(srCommand).toBeDefined();

      const registeredSubcommands = (srCommand?.commands ?? []).filter(
         (cmd) =>
            cmd.name() !== 'help' && !(cmd as unknown as { _hidden?: boolean })._hidden,
      );
      expect(registeredSubcommands.length).toBeGreaterThan(0);

      for (const cmd of registeredSubcommands) {
         const name = cmd.name();
         const meta = SR_VERB_REGISTRY.find((entry) => entry.verb === name);
         expect(
            meta,
            `Subcommand "${name}" should be present in SR_VERB_REGISTRY`,
         ).toBeDefined();
         if (!meta) {
            continue;
         }

         const expectedHeading = SR_GROUP_HEADINGS[meta.group];
         const actualGroup =
            typeof (cmd as unknown as { helpGroup?: () => string }).helpGroup ===
            'function'
               ? (cmd as unknown as { helpGroup: () => string }).helpGroup()
               : (cmd as unknown as { _helpGroupHeading?: string })._helpGroupHeading;
         expect(
            actualGroup,
            `Subcommand "${name}" should have helpGroup matching ${meta.group} ("${expectedHeading}")`,
         ).toBe(expectedHeading);
      }
   });
});
