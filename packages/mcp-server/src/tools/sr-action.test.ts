import {
   getSrActionMetadata,
   getSrVerbMetadata,
   getVerbsForGroup,
   SR_ACTION_ENUM_VALUES,
   SR_TASK_GROUPS,
   type SrTaskGroup,
} from '@a11ied/guidepup';
import { describe, expect, it } from 'vitest';

import { withHarness } from '../testing/harness.js';
import { SR_ACTION_DESCRIPTION, srActionInputSchema } from './sr-action.js';

const EXPECTED_ACTION_COUNT = 11;
const MAX_SR_TOOL_DESCRIPTION_CHARS = 800;
const MIN_SR_TOOLS_COUNT = 5;

describe('sr_action tool and verb registry parity', () => {
   it('every action in srActionInputSchema action enum has a registry entry and appears in SR_ACTION_DESCRIPTION', () => {
      const actions = srActionInputSchema.shape.action.options;

      expect(actions).toEqual([...SR_ACTION_ENUM_VALUES]);
      expect(actions.length).toBe(EXPECTED_ACTION_COUNT);

      for (const action of actions) {
         // Verify it has an entry in the shared registry
         const actionMeta = getSrActionMetadata(action);
         expect(
            actionMeta,
            `Action '${action}' must have an entry in getSrActionMetadata`,
         ).toBeDefined();
         expect(actionMeta?.action).toBe(action);
         expect(actionMeta?.verb).toBeDefined();
         expect(SR_TASK_GROUPS).toContain(actionMeta?.group);
         expect(actionMeta?.summary.length).toBeGreaterThan(0);
         expect(actionMeta?.cliEquivalent).toMatch(/^a1 /);

         // Verify getSrVerbMetadata resolves it or its canonical verb
         const verbMeta = getSrVerbMetadata(action);
         expect(
            verbMeta,
            `Verb metadata for '${action}' should be resolvable`,
         ).toBeDefined();

         // Verify it appears in the generated SR_ACTION_DESCRIPTION
         expect(
            SR_ACTION_DESCRIPTION,
            `SR_ACTION_DESCRIPTION should mention action '${action}'`,
         ).toContain(action);
      }
   });

   it('all 6 N4 task groups and their verbs are present in the registry', () => {
      const expectedByGroup: Record<SrTaskGroup, string[]> = {
         session: ['start', 'stop', 'status', 'doctor'],
         navigate: ['next', 'previous', 'goto', 'top', 'bottom', 'rotor', 'read'],
         interact: [
            'press',
            'type',
            'click',
            'activate',
            'focus',
            'interact',
            'stop-interacting',
            'perform',
         ],
         assert: ['expect', 'wait', 'snapshot'],
         inspect: ['cursor', 'spoken', 'last', 'history', 'tree', 'commands'],
         bulk: ['walk', 'batch'],
      };

      expect(SR_TASK_GROUPS.toSorted()).toEqual(Object.keys(expectedByGroup).toSorted());

      for (const [group, expectedVerbs] of Object.entries(expectedByGroup)) {
         const groupEntries = getVerbsForGroup(group as SrTaskGroup);
         const groupVerbs = groupEntries.map((entry) => entry.verb);

         for (const verb of expectedVerbs) {
            expect(
               groupVerbs,
               `Group '${group}' should contain canonical verb '${verb}'`,
            ).toContain(verb);

            const meta = getSrVerbMetadata(verb);
            expect(meta, `Verb '${verb}' metadata should exist`).toBeDefined();
            expect(meta?.group).toBe(group);
         }
      }
   });

   it('SR_ACTION_DESCRIPTION length is <= 800 characters', () => {
      expect(SR_ACTION_DESCRIPTION.length).toBeLessThanOrEqual(
         MAX_SR_TOOL_DESCRIPTION_CHARS,
      );
   });

   it('every MCP screen reader tool description is <= 800 characters (NFR-2)', async () => {
      await withHarness(async (harness) => {
         const { tools } = await harness.client.listTools();
         const srTools = tools.filter((tool) => tool.name.startsWith('sr_'));

         expect(srTools.length).toBeGreaterThanOrEqual(MIN_SR_TOOLS_COUNT);

         for (const tool of srTools) {
            const descLength = tool.description?.length ?? 0;
            expect(
               descLength,
               `Description of tool '${tool.name}' (${descLength} chars) must be <= 800 characters`,
            ).toBeLessThanOrEqual(MAX_SR_TOOL_DESCRIPTION_CHARS);
            expect(
               descLength,
               `Description of tool '${tool.name}' should not be empty`,
            ).toBeGreaterThan(0);
         }
      });
   });
});
