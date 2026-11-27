import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectAgentEditors, installAgentItems } from './setup-agents.js';

let home = '';

beforeEach(() => {
   home = mkdtempSync(join(tmpdir(), 'a11ied-agents-'));
   mkdirSync(join(home, '.claude'));
   vi.stubEnv('AIX_USER_HOME', home);
});

afterEach(() => {
   vi.unstubAllEnvs();
   rmSync(home, { recursive: true, force: true });
});

describe('installAgentItems', () => {
   it('installs the bundled skills and an npx MCP server into Claude Code', async () => {
      const detected = await detectAgentEditors();
      const editors = detected.filter((editor) => editor.id === 'claude-code');
      const outcomes = await installAgentItems({
         sections: ['skills', 'mcp'],
         editors,
         hasGlobalInstall: false,
      });
      const config = JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8')) as {
         mcpServers: Record<string, { command: string; args: string[] }>;
      };

      expect(outcomes.map((outcome) => outcome.name)).toEqual([
         'a11ied',
         'a11ied-audit',
         'a11ied',
      ]);
      expect(outcomes.every((outcome) => outcome.isInstalled)).toBe(true);
      expect(outcomes[0]?.editorLabel).toBe('Claude Code');
      expect(existsSync(join(home, '.claude', 'skills', 'a11ied', 'SKILL.md'))).toBe(
         true,
      );
      expect(config.mcpServers.a11ied).toMatchObject({
         command: 'npx',
         args: ['-y', 'a11ied', 'mcp'],
      });
   });
});
