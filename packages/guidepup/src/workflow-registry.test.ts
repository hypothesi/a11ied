import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { screenReaderMatchers } from '../../cli/src/vitest/matchers.js';

import {
   generateSrActionDescription,
   generateSrSessionDescription,
   getSrActionMetadata,
   getRegisteredQueuedMethodNames,
   getRegisteredVitestMatcherNames,
   getSrCliVerbGroupHeading,
   getSrVerbMetadata,
   getVerbsForGroup,
   SR_ACTION_ENUM_VALUES,
   SR_GROUP_HEADINGS,
   SR_TASK_GROUPS,
   SR_VERB_REGISTRY,
   type SrTaskGroup,
} from './workflow-registry.js';

const EXPECTED_VERBS_BY_GROUP: Record<SrTaskGroup, string[]> = {
   session: ['start', 'open', 'stop', 'status', 'doctor'],
   navigate: [
      'next',
      'previous',
      'goto',
      'top',
      'bottom',
      'rotor',
      'read',
      'read-all',
      'elements',
      'title',
      'find',
      'table',
   ],
   interact: [
      'press',
      'type',
      'click',
      'activate',
      'focus',
      'interact',
      'stop-interacting',
      'perform',
      'do',
      'escape',
   ],
   assert: ['expect', 'wait', 'checkpoint', 'snapshot'],
   inspect: [
      'transcript',
      'screenshot',
      'tail',
      'list',
      'cursor',
      'spoken',
      'last',
      'history',
      'tree',
      'commands',
   ],
   bulk: ['walk', 'batch'],
};

const EXPECTED_SR_ACTIONS = [
   'next',
   'previous',
   'navigate',
   'act',
   'press',
   'type',
   'perform',
   'click',
   'interact',
   'stopInteracting',
   'takeSnapshot',
] as const;

const MAX_DESCRIPTION_LENGTH = 800;

const MAX_SKILL_DOC_LINES = 300;
const MAX_FORWARDING_STUB_LINES = 20;
const REVIEW_WORKFLOW_TOOLS = [
   'review.start',
   'review.next',
   'review.judge',
   'review.report',
   'review.run',
];

describe('Screen Reader Workflow / Verb Metadata Registry', () => {
   it('defines the 6 canonical N4 task groups and headings', () => {
      const expectedGroups: SrTaskGroup[] = [
         'session',
         'navigate',
         'interact',
         'assert',
         'inspect',
         'bulk',
      ];
      expect([...SR_TASK_GROUPS]).toEqual(expectedGroups);
      for (const group of expectedGroups) {
         expect(SR_GROUP_HEADINGS[group]).toBeDefined();
         expect(typeof SR_GROUP_HEADINGS[group]).toBe('string');
      }
   });

   it('contains all required verbs organized by the 6 task groups', () => {
      for (const [group, verbs] of Object.entries(EXPECTED_VERBS_BY_GROUP)) {
         const groupEntries = getVerbsForGroup(group as SrTaskGroup);
         const groupVerbs = groupEntries.map((entry) => entry.verb);
         for (const verb of verbs) {
            expect(groupVerbs).toContain(verb);
            const meta = getSrVerbMetadata(verb);
            expect(meta).toBeDefined();
            expect(meta?.group).toBe(group);
            expect(meta?.summary.length).toBeGreaterThan(0);
            expect(getSrCliVerbGroupHeading(verb)).toBe(
               SR_GROUP_HEADINGS[group as SrTaskGroup],
            );
         }
      }
   });

   it('maps all 11 sr_action MCP action enum values to canonical metadata', () => {
      expect([...SR_ACTION_ENUM_VALUES]).toEqual(EXPECTED_SR_ACTIONS);

      for (const action of EXPECTED_SR_ACTIONS) {
         const meta = getSrActionMetadata(action);
         expect(meta, `Metadata for action ${action}`).toBeDefined();
         expect(meta?.action).toBe(action);
         expect(meta?.verb.length).toBeGreaterThan(0);
         expect(SR_TASK_GROUPS).toContain(meta?.group);
         expect(meta?.summary.length).toBeGreaterThan(0);
         expect(meta?.cliEquivalent).toMatch(/^a1 /);
         expect(Array.isArray(meta?.payloadFields)).toBe(true);
      }
   });
});

describe('SR vitest matcher parity', () => {
   it('registers every vitest matcher the expect extension installs', () => {
      const matcherNames = getRegisteredVitestMatcherNames();

      expect(new Set(matcherNames)).toEqual(new Set(Object.keys(screenReaderMatchers)));
   });
});

describe('SR queued method parity', () => {
   it('returns deduplicated queued method names for the registry', () => {
      const methodNames = getRegisteredQueuedMethodNames();

      expect(new Set(methodNames).size).toBe(methodNames.length);
      expect(methodNames).toContain('goTo');
      expect(methodNames).toContain('goto');
      expect(methodNames).toContain('stop');
   });
});

describe('sr_action and sr_session descriptions', () => {
   it('generates an sr_action description <= 800 characters containing all actions', () => {
      const desc = generateSrActionDescription();
      expect(desc.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      for (const action of SR_ACTION_ENUM_VALUES) {
         expect(desc).toContain(action);
      }
   });

   it('generates an sr_session description <= 800 characters', () => {
      const desc = generateSrSessionDescription();
      expect(desc.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      expect(desc).toContain('start');
      expect(desc).toContain('stop');
      expect(desc).toContain('status');
   });
});

describe('skill and docs parity with the registry', () => {
   const repoRoot = resolve(import.meta.dirname, '../../..');
   const cheatSheet = readFileSync(
      resolve(repoRoot, 'packages/skills/a11ied/resources/command-cheat-sheet.md'),
      'utf8',
   );
   const skillDoc = readFileSync(
      resolve(repoRoot, 'packages/skills/a11ied/SKILL.md'),
      'utf8',
   );

   it('documents every cliSubcommand of SR_VERB_REGISTRY in the command cheat sheet', () => {
      const subcommands = SR_VERB_REGISTRY.map((entry) => entry.cliSubcommand).filter(
         (subcommand) => subcommand !== undefined,
      );

      expect(subcommands.length).toBeGreaterThan(0);
      for (const subcommand of new Set(subcommands)) {
         expect(
            cheatSheet.includes(`sr ${subcommand}`),
            `command-cheat-sheet.md should mention "sr ${subcommand}"`,
         ).toBe(true);
      }
   });

   it('documents all 6 task group names in SKILL.md', () => {
      for (const group of [
         'Session',
         'Navigate',
         'Interact',
         'Assert',
         'Inspect',
         'Bulk',
      ]) {
         expect(
            skillDoc.includes(group),
            `SKILL.md should mention the "${group}" group`,
         ).toBe(true);
      }
   });

   it('keeps SKILL.md under 300 lines and documents the review workflow', () => {
      expect(skillDoc.split('\n').length).toBeLessThan(MAX_SKILL_DOC_LINES);
      for (const tool of REVIEW_WORKFLOW_TOOLS) {
         expect(skillDoc.includes(tool), `SKILL.md should mention "${tool}"`).toBe(true);
      }
   });

   it('keeps full-site-audit/SKILL.md as a forwarding stub pointing at a11ied', () => {
      const stub = readFileSync(
         resolve(repoRoot, 'packages/skills/full-site-audit/SKILL.md'),
         'utf8',
      );

      expect(stub.split('\n').length).toBeLessThanOrEqual(MAX_FORWARDING_STUB_LINES);
      expect(stub).toContain('../a11ied/SKILL.md');
   });
});
