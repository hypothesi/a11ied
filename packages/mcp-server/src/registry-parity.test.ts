import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ObservationBundle } from '@a11ied/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { getSrActionMetadata, getVerbsForGroup, SR_TASK_GROUPS } from '@a11ied/guidepup';
import { withHarness } from './testing/harness.js';
import { SR_ACTION_DESCRIPTION, srActionInputSchema } from './tools/sr-action.js';

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
   'report help',
   'review help',
   // Runs interactive OS permission prompts and downloads screen reader assets.
   'setup',
   // Reads a file of JSON-lines actions for shell scripting, not one call.
   'sr batch',
   // Composes sr_session start + sr_action read-all + sr_transcript.
   'sr walk',
   // Streams real-time announcements continuously; not an RPC tool call.
   'sr tail',
   // Deletes recorded results. An agent records and reads; a person decides what to drop.
   'audit clear',
]);

/** Every remaining CLI command path, mapped to the MCP tool name(s) that cover it. */
const TOOL_BY_COMMAND: Readonly<Record<string, readonly string[]>> = {
   wcag: ['wcag_show', 'wcag_criteria', 'wcag_rule'],
   search: ['search'],
   'wcag criteria': ['wcag_criteria'],
   'wcag show': ['wcag_show'],
   'wcag understanding': ['wcag_show'],
   'wcag rule': ['wcag_rule'],
   pattern: ['pattern_show', 'pattern_find'],
   'pattern list': ['pattern_show'],
   'pattern role': ['pattern_find'],
   'pattern attribute': ['pattern_find'],
   'pattern check': ['pattern_check'],
   'pattern record': ['pattern_record'],
   'pattern pending': ['pattern_pending'],
   axe: ['run_axe'],
   tree: ['tree'],
   audit: ['audit'],
   'audit record': ['record_result'],
   'audit pending': ['list_pending_results'],
   'audit discover': ['audit_discover'],
   'audit probe': ['audit_probe'],
   'audit run': ['audit_assessment'],
   'audit state': ['audit_assessment'],
   'audit journey': ['audit_assessment'],
   'audit queue': ['audit_assessment'],
   'audit next': ['audit_assessment'],
   'audit status': ['audit_assessment'],
   'audit resume': ['audit_assessment'],
   'audit evaluate': ['audit_assessment'],
   'audit block': ['audit_assessment'],
   'audit finalize': ['audit_assessment'],
   review: ['review.start', 'review_start'],
   'review start': ['review.start', 'review_start'],
   'review resume': ['review.resume', 'review_resume'],
   'review next': ['review.next', 'review_next'],
   'review observe': ['review.observe', 'review_observe'],
   'review judge': ['review.judge', 'review_judge'],
   'review status': ['review.status', 'review_status'],
   'review report': ['review.report', 'review_report'],
   'review run': ['review.run', 'review_run'],
   'report build': ['report_build'],
   report: ['report_build'],
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

describe('screen reader verb registry parity and MCP description budget (NFR-2)', () => {
   it('every action in srActionInputSchema action enum is in the registry and in SR_ACTION_DESCRIPTION', () => {
      const actions = srActionInputSchema.shape.action.options;
      for (const action of actions) {
         expect(getSrActionMetadata(action)).toBeDefined();
         expect(SR_ACTION_DESCRIPTION).toContain(action);
      }
   });

   it('all 6 N4 task groups and verbs are in the registry', () => {
      const groups = [
         'session',
         'navigate',
         'interact',
         'assert',
         'inspect',
         'bulk',
      ] as const;
      expect([...SR_TASK_GROUPS].toSorted()).toEqual([...groups].toSorted());
      for (const group of groups) {
         expect(getVerbsForGroup(group).length).toBeGreaterThan(0);
      }
   });

   it('every MCP screen reader tool description is <= 800 characters', async () => {
      const maxDescriptionLength = 800;
      const minSrToolsCount = 5;
      expect(SR_ACTION_DESCRIPTION.length).toBeLessThanOrEqual(maxDescriptionLength);
      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools();
         const srTools = tools.filter((tool) => tool.name.startsWith('sr_'));
         expect(srTools.length).toBeGreaterThanOrEqual(minSrToolsCount);
         for (const tool of srTools) {
            expect(tool.description?.length ?? 0).toBeLessThanOrEqual(
               maxDescriptionLength,
            );
         }
      });
   });
});

function createMcpMockBundle(): ObservationBundle {
   return {
      version: '1',
      fingerprint: 'fp-mcp-review-test',
      targetUrl: 'https://example.com/mcp-test',
      stateId: 'root',
      capturedAt: '2026-11-10T12:00:00.000Z',
      setup: [],
      actionTrace: [],
      treeHash: 'tree-hash-mcp',
      axe: { passes: [], violations: [], incomplete: [], inapplicable: [] },
      tree: { yaml: 'root: page', nodes: [] },
      facts: {
         title: 'MCP Review Test Page',
         lang: 'en',
         landmarks: { main: 1 },
         skipLink: '#main',
         headings: [{ level: 1, text: 'MCP Review' }],
         links: [{ name: 'Home', href: '/' }],
         controls: [{ type: 'button', label: 'Submit' }],
         tabStops: [{ id: 'b1', obscured: false, inView: true }],
         interactiveCount: 1,
         media: { video: 0, audio: 0, autoplay: 0, embeds: [] },
         runningAnimations: [],
         smallTargets: [],
         noIndicator: [],
         clickOnNonInteractive: [],
         trapSuspected: false,
         metaRefresh: false,
         urlUnchangedAfterTab: true,
      },
      heuristics: {
         hasSiteNavigation: true,
         hasMultipointGesture: false,
         hasDraggable: false,
      },
      contrast: [],
      viewports: {
         desktop: { width: 1280, height: 800 },
         reflow320: { overflowPx: 0, wideElements: [] },
         zoom200: { overflowPx: 0 },
         portrait: { overflowPx: 0 },
         textSpacingClipped: [],
      },
      screenshots: {
         fullPagePath: 'cache/fp-mcp-review-test/full.png',
         elements: {},
      },
      transcript: {
         provenance: 'virtual-dom',
         spokenOrder: ['MCP Review', 'Submit'],
         headings: ['MCP Review'],
         landmarks: ['main'],
         links: [],
         formControls: ['Submit'],
         liveRegions: [],
      },
      interactiveCandidates: [],
   };
}

describe('N5 review facade parity', () => {
   it('registers all 8 review operations and their underscore aliases on McpServer', async () => {
      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools();
         const toolNames = new Set(tools.map((tool) => tool.name));

         const canonicalOps = [
            'review.start',
            'review.resume',
            'review.next',
            'review.observe',
            'review.judge',
            'review.status',
            'review.report',
            'wcag.show',
            'doctor',
         ];

         for (const op of canonicalOps) {
            expect(
               toolNames.has(op),
               `Expected canonical tool '${op}' to be registered`,
            ).toBe(true);
         }

         const underscoreAliases = [
            'review_start',
            'review_resume',
            'review_next',
            'review_observe',
            'review_judge',
            'review_status',
            'review_report',
            'review_run',
            'wcag_show',
         ];

         for (const alias of underscoreAliases) {
            expect(
               toolNames.has(alias),
               `Expected underscore alias '${alias}' to be registered`,
            ).toBe(true);
         }
      });
   });

   it('rejects generic MCP passes while retaining draft reporting', async () => {
      const testDir = await mkdtemp(join(tmpdir(), 'a11ied-mcp-review-'));
      try {
         const mockBundle = createMcpMockBundle();

         await withHarness(async (harness) => {
            const startRes = await harness.client.callTool({
               name: 'review.start',
               arguments: {
                  runDir: testDir,
                  target: 'https://example.com/mcp-test',
                  states: [
                     {
                        stateId: 'root',
                        targetUrl: 'https://example.com/mcp-test',
                        bundle: mockBundle,
                     },
                  ],
               },
            });
            expect(startRes.isError).toBeFalsy();
            expect(startRes.structuredContent).toMatchObject({
               runId: expect.any(String),
            });

            const nextRes = await harness.client.callTool({
               name: 'review.next',
               arguments: { runDir: testDir, agentId: 'agent-mcp-test', count: 5 },
            });
            expect(nextRes.isError).toBeFalsy();
            const nextContent = z
               .object({
                  packet: z.object({
                     stateId: z.string(),
                     checks: z.array(
                        z.object({ criterionId: z.string(), procedureId: z.string() }),
                     ),
                  }),
               })
               .parse(nextRes.structuredContent);
            const verdicts = nextContent.packet.checks.map((check) => ({
               criterionId: check.criterionId,
               procedureId: check.procedureId,
               stateId: nextContent.packet.stateId,
               method: 'agent-judgment',
               outcome: 'passed',
               rationale: 'Verified pass via MCP harness test.',
            }));
            const judgeRes = await harness.client.callTool({
               name: 'review.judge',
               arguments: { runDir: testDir, agentId: 'agent-mcp-test', verdicts },
            });
            expect(judgeRes.isError).toStrictEqual(true);

            const statusRes = await harness.client.callTool({
               name: 'review.status',
               arguments: { runDir: testDir, full: true },
            });
            expect(statusRes.isError).toBeFalsy();

            const reportRes = await harness.client.callTool({
               name: 'review.report',
               arguments: { runDir: testDir, draft: true },
            });
            expect(reportRes.isError).toBeFalsy();
            expect(reportRes.structuredContent).toMatchObject({
               paths: { markdownPath: expect.any(String) },
            });
            expect(reportRes.structuredContent).toMatchObject({
               report: { isDraft: true },
            });
         });
      } finally {
         await rm(testDir, { recursive: true, force: true });
      }
   });
});
