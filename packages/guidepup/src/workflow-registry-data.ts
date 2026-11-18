/**
 * Data for the shared screen reader workflow / verb metadata registry.
 *
 * The 6 N4 task groups:
 *
 * - Session: start, stop, status, doctor
 * - Navigate: next, previous, goto, top, bottom, rotor, read
 * - Interact: press, type, click, activate, focus, interact, stop-interacting, perform
 * - Assert: expect, wait, snapshot
 * - Inspect: cursor, spoken, last, history, tree, commands
 * - Bulk: walk, batch
 */

import type {
   SrActionEnumValue,
   SrActionMetadata,
   SrTaskGroup,
   SrVerbMetadata,
} from './workflow-registry-types.js';
import { SR_ASSERT_INSPECT_BULK_VERBS } from './workflow-registry-verbs-assert-inspect-bulk.js';
import { SR_SESSION_NAVIGATE_INTERACT_VERBS } from './workflow-registry-verbs-session-navigate-interact.js';

export const SR_GROUP_ORDER = [
   'session',
   'navigate',
   'interact',
   'assert',
   'inspect',
   'bulk',
] as const;

export const SR_GROUP_HEADINGS: Record<SrTaskGroup, string> = {
   session: 'Start and stop a session:',
   navigate: 'Navigate through the page:',
   interact: 'Interact with controls:',
   assert: 'Assert spoken output:',
   inspect: 'Inspect transcript and state:',
   bulk: 'Bulk and scripted runs:',
} as const;

export const SR_VERB_REGISTRY: readonly SrVerbMetadata[] = [
   ...SR_SESSION_NAVIGATE_INTERACT_VERBS,
   ...SR_ASSERT_INSPECT_BULK_VERBS,
];

export const SR_ACTION_METADATA: Record<SrActionEnumValue, SrActionMetadata> = {
   next: {
      action: 'next',
      verb: 'next',
      group: 'navigate',
      summary: 'Move to next item or element kind',
      cliEquivalent: 'a1 sr next [kind]',
      payloadFields: ['kind', 'level', 'times'],
   },
   previous: {
      action: 'previous',
      verb: 'previous',
      group: 'navigate',
      summary: 'Move to previous item or kind',
      cliEquivalent: 'a1 sr previous [kind]',
      payloadFields: ['kind', 'level', 'times'],
   },
   navigate: {
      action: 'navigate',
      verb: 'goto',
      group: 'navigate',
      summary: 'Step to matching role/name',
      cliEquivalent: 'a1 sr goto',
      payloadFields: ['role', 'name', 'max'],
   },
   act: {
      action: 'act',
      verb: 'activate',
      group: 'interact',
      summary: 'Activate current item',
      cliEquivalent: 'a1 sr activate',
      payloadFields: [],
   },
   press: {
      action: 'press',
      verb: 'press',
      group: 'interact',
      summary: 'Press key chords in order',
      cliEquivalent: 'a1 sr press <keys...>',
      payloadFields: ['keys'],
   },
   type: {
      action: 'type',
      verb: 'type',
      group: 'interact',
      summary: 'Type text into field',
      cliEquivalent: 'a1 sr type <text>',
      payloadFields: ['text'],
   },
   perform: {
      action: 'perform',
      verb: 'perform',
      group: 'interact',
      summary: 'Run named command from sr_list',
      cliEquivalent: 'a1 sr do <command>',
      payloadFields: ['command', 'commandSet'],
   },
   click: {
      action: 'click',
      verb: 'click',
      group: 'interact',
      summary: 'Click current item',
      cliEquivalent: 'a1 sr activate',
      payloadFields: [],
   },
   interact: {
      action: 'interact',
      verb: 'interact',
      group: 'interact',
      summary: 'Enter interaction mode',
      cliEquivalent: 'a1 sr interact',
      payloadFields: [],
   },
   stopInteracting: {
      action: 'stopInteracting',
      verb: 'stop-interacting',
      group: 'interact',
      summary: 'Leave interaction mode',
      cliEquivalent: 'a1 sr stop-interacting',
      payloadFields: [],
   },
   takeSnapshot: {
      action: 'takeSnapshot',
      verb: 'snapshot',
      group: 'assert',
      summary: 'Capture screenshot/state',
      cliEquivalent: 'a1 sr screenshot',
      payloadFields: ['path'],
   },
};
