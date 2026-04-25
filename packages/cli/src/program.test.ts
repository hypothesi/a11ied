import { describe, expect, it } from 'vitest';

import {
   driveRunHelpCases,
   helpAllExpectations,
   inspectHelpCases,
   type HelpCase,
   runOptionCases,
   topLevelHelpCases,
   verifyHelpCases,
} from './program-help-fixtures.js';
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
registerHelpCases('cli inspect grammar', inspectHelpCases);
registerHelpCases('cli drive and run grammar', driveRunHelpCases);
registerHelpCases('cli verify grammar', verifyHelpCases);
registerHelpCases('cli run options grammar', runOptionCases);

describe('cli aggregate help', () => {
   it('prints the full command tree in one shot', async () => {
      const result = await runCli(['help-all']);

      expect(result.status).toBe(EXIT_SUCCESS);
      for (const line of helpAllExpectations) {
         expect(result.stdout).toContain(line);
      }
   });
});

describe('cli drive command listing', () => {
   it('lists supported driver commands without requiring a session', async () => {
      const result = await runCli([
         'drive',
         'commands',
         '--target',
         'voiceover',
         '--command-set',
         'voiceover-commander',
         '--query',
         'move-right',
      ]);

      expect(result.status).toBe(EXIT_SUCCESS);
      expect(result.stdout).toContain('voiceover / voiceover-commander');
      expect(result.stdout).toContain('move-right');
      expect(result.stdout).toContain('MOVE_RIGHT');
   });
});
