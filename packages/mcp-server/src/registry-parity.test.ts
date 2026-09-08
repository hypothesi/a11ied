import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { withHarness } from './testing/harness.js';

const CLI_DIST = resolve(import.meta.dirname, '../../cli/dist/cli.js');
const COMMAND_NAME_PATTERN = /^ {2}([a-z][a-z-]*)/u;
const SEPARATOR_PATTERN = /\n─+\n/u;
/** A sanity floor: the CLI has at least this many command paths across every family. */
const MIN_EXPECTED_COMMAND_PATHS = 20;

/**
 * CLI commands with no MCP tool by design. Each entry names the reason so a reviewer can
 * tell a deliberate gap from a forgotten one.
 */
const INTENTIONALLY_UNCOVERED: ReadonlySet<string> = new Set([
   // Starts this server; nothing to wrap.
   'mcp',
   // Prints CLI help text, not an operation.
   'help-all',
   'help',
   'sr help',
   // Runs interactive OS permission prompts and downloads screen reader assets.
   'setup',
   // Reads a file of JSON-lines actions for shell scripting, not one call.
   'sr batch',
   // Composes sr_session start + sr_action read-all + sr_transcript.
   'sr walk',
   // Deletes recorded results. An agent records and reads; a person decides what to drop.
   'audit clear',
]);

/** Every remaining CLI command path, mapped to the MCP tool name(s) that cover it. */
const TOOL_BY_COMMAND: Readonly<Record<string, readonly string[]>> = {
   wcag: ['wcag_show', 'wcag_criteria', 'wcag_search', 'wcag_rule'],
   'wcag criteria': ['wcag_criteria'],
   'wcag show': ['wcag_show'],
   'wcag understanding': ['wcag_show'],
   'wcag search': ['wcag_search'],
   'wcag rule': ['wcag_rule'],
   pattern: ['pattern_show', 'pattern_find'],
   'pattern list': ['pattern_show'],
   'pattern role': ['pattern_find'],
   'pattern attribute': ['pattern_find'],
   'pattern check': ['pattern_check'],
   axe: ['run_axe'],
   tree: ['tree'],
   audit: ['audit'],
   'audit record': ['record_result'],
   'audit pending': ['list_pending_results'],
   doctor: ['doctor'],
   sr: ['sr_session', 'sr_action', 'sr_list', 'sr_expect', 'sr_transcript'],
   'sr start': ['sr_session'],
   'sr open': ['sr_session'],
   'sr stop': ['sr_session'],
   'sr status': ['sr_session'],
   'sr read': ['sr_action'],
   'sr title': ['sr_action'],
   'sr next': ['sr_action'],
   'sr previous': ['sr_action'],
   'sr interact': ['sr_action'],
   'sr stop-interacting': ['sr_action'],
   'sr activate': ['sr_action'],
   'sr top': ['sr_action'],
   'sr bottom': ['sr_action'],
   'sr escape': ['sr_action'],
   'sr find': ['sr_action'],
   'sr table': ['sr_action'],
   'sr goto': ['sr_action'],
   'sr elements': ['sr_action'],
   'sr read-all': ['sr_action'],
   'sr press': ['sr_action'],
   'sr type': ['sr_action'],
   'sr do': ['sr_action'],
   'sr focus': ['sr_action'],
   'sr screenshot': ['sr_action'],
   'sr wait': ['sr_action'],
   'sr expect': ['sr_expect'],
   'sr checkpoint': ['sr_action'],
   'sr transcript': ['sr_transcript', 'sr_action'],
   'sr list': ['sr_list'],
};

function runCliHelpAll(): string {
   const result = spawnSync(process.execPath, [CLI_DIST, 'help-all'], {
      encoding: 'utf8',
   });
   return result.stdout;
}

/**
 * Every subcommand list is under its own heading now (`Start and stop a session:`,
 * `Other:`, ...) instead of one shared `Commands:` marker, so a block counts as a
 * subcommand list when its heading is anything but `Options:` or `Arguments:`. An option
 * line never matches COMMAND_NAME_PATTERN (it starts with `-`), so scanning an
 * option-group heading such as `Choose rules:` by mistake finds nothing either way.
 */
const NON_COMMAND_HEADINGS: ReadonlySet<string> = new Set(['Options:', 'Arguments:']);
const HEADING_LINE_PATTERN = /^[A-Z][A-Za-z0-9 ]*:$/u;

function extractSubcommandNames(commandBlock: string): string[] {
   const names: string[] = [];
   for (const block of commandBlock.split('\n\n')) {
      const [headingLine = '', ...itemLines] = block.split('\n');
      if (
         !HEADING_LINE_PATTERN.test(headingLine) ||
         NON_COMMAND_HEADINGS.has(headingLine)
      ) {
         continue;
      }
      for (const line of itemLines) {
         const match = COMMAND_NAME_PATTERN.exec(line);
         if (match?.[1]) {
            names.push(match[1]);
         }
      }
   }
   return names;
}

/** Every command path (`sr open`, `wcag rule`, `axe`, ...) the built CLI registers. */
function listCliCommandPaths(): string[] {
   const chunks = runCliHelpAll()
      .split(SEPARATOR_PATTERN)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.startsWith('a1'));
   const paths: string[] = [];
   for (const chunk of chunks) {
      const [firstLine = ''] = chunk.split('\n'),
         commandPath = firstLine.slice('a1'.length).trim();
      for (const subcommand of extractSubcommandNames(chunk)) {
         paths.push(commandPath ? `${commandPath} ${subcommand}` : subcommand);
      }
   }
   return paths;
}

describe('MCP tool list against the CLI command registry', () => {
   it('has a matching tool, or a documented reason, for every CLI command', async () => {
      const commandPaths = listCliCommandPaths();
      expect(commandPaths.length).toBeGreaterThan(MIN_EXPECTED_COMMAND_PATHS);

      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools(),
            toolNames = new Set(tools.map((tool) => tool.name));
         const missing: string[] = [],
            undocumented: string[] = [];

         for (const path of commandPaths) {
            if (INTENTIONALLY_UNCOVERED.has(path)) {
               continue;
            }
            const candidates = TOOL_BY_COMMAND[path];
            if (!candidates) {
               undocumented.push(path);
               continue;
            }
            if (!candidates.some((name) => toolNames.has(name))) {
               missing.push(path);
            }
         }

         expect(
            undocumented,
            'CLI commands with no tool mapping and no documented gap',
         ).toEqual([]);
         expect(missing, 'CLI commands whose mapped tool is not registered').toEqual([]);
      });
   });

   it('names no tool for a command the CLI has removed', async () => {
      const commandPaths = new Set(listCliCommandPaths());
      const declaredPaths = [...Object.keys(TOOL_BY_COMMAND), ...INTENTIONALLY_UNCOVERED];
      const stale = declaredPaths.filter((path) => !commandPaths.has(path));

      expect(
         stale,
         'tool mapping entries for a CLI command that no longer exists',
      ).toEqual([]);
   });
});
