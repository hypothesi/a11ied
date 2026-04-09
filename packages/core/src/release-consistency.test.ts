import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { listCliCommands } from './index.js';

const repoRoot = resolve(import.meta.dirname, '../../..');

function readRepoFile(relativePath: string): string {
   return readFileSync(resolve(repoRoot, relativePath), 'utf8');
}

describe('release consistency guardrails', () => {
   it('keeps shipped CLI command metadata on ready-only surfaces', () => {
      const commands = listCliCommands();

      expect(commands.map((command) => command.name)).toEqual([
         'wcag',
         'inspect',
         'drive',
         'doctor',
         'run',
         'verify',
         'mcp',
      ]);
      expect(commands.every((command) => command.maturity === 'ready')).toBe(true);
   });

   it('keeps the shipped skill package map free of stale planned markers', () => {
      const skill = readRepoFile('skills/a11ied/SKILL.md');

      expect(skill).not.toMatch(/^- planned:/m);
   });

   it('keeps placeholder public commands out of the CLI program source', () => {
      const programSource = readRepoFile('packages/cli/src/program.ts');

      expect(programSource).not.toContain(".command('catalog')");
      expect(programSource).not.toContain(".command('story')");
      expect(programSource).not.toContain('notReady(');
   });
});
