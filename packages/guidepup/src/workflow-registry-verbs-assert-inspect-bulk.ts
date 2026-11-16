/** Screen reader verb metadata: assert, inspect, and bulk groups. */

import type { SrVerbMetadata } from './workflow-registry-types.js';

/** Assert, inspect, and bulk verbs, in registry order. */
export const SR_ASSERT_INSPECT_BULK_VERBS: readonly SrVerbMetadata[] = [
   // Assert
   {
      verb: 'expect',
      group: 'assert',
      summary: 'Assert that the reader announced a phrase',
      cliSubcommand: 'expect',
      cliEquivalent: 'a1 sr expect',
      payloadFields: ['pattern', 'since', 'not'],
      queuedMethods: ['expectSpoken', 'expectSpokenInOrder', 'expectCursorOn'],
      vitestMatchers: ['toHaveSpoken', 'toHaveSpokenInOrder', 'toHaveCursorOn'],
   },
   {
      verb: 'wait',
      group: 'assert',
      summary: 'Wait for a phrase in transcript or a duration',
      cliSubcommand: 'wait',
      cliEquivalent: 'a1 sr wait',
      payloadFields: ['for', 'since', 'ms', 'timeoutMs'],
      queuedMethods: ['wait'],
   },
   {
      verb: 'checkpoint',
      group: 'assert',
      summary: 'Mark a named point in the transcript for --since',
      cliSubcommand: 'checkpoint',
      cliEquivalent: 'a1 sr checkpoint <label>',
      payloadFields: ['label'],
      queuedMethods: ['checkpoint'],
   },
   {
      verb: 'snapshot',
      group: 'assert',
      summary: 'Capture screen reader state or screenshot',
      cliSubcommand: 'screenshot',
      cliEquivalent: 'a1 sr screenshot',
      payloadFields: ['path'],
   },

   // Inspect
   {
      verb: 'transcript',
      group: 'inspect',
      summary: 'Print what the reader said, with timestamps and checkpoints',
      cliSubcommand: 'transcript',
      cliEquivalent: 'a1 sr transcript',
      payloadFields: ['since', 'tail', 'afterIndex', 'limit', 'out', 'format'],
      queuedMethods: ['transcript'],
      vitestMatchers: ['toHaveSpoken', 'toHaveSpokenInOrder'],
   },
   {
      verb: 'screenshot',
      group: 'inspect',
      summary: 'Save a picture of what the VoiceOver cursor is on',
      cliSubcommand: 'screenshot',
      cliEquivalent: 'a1 sr screenshot <path>',
      payloadFields: ['path'],
      queuedMethods: ['screenshot'],
   },
   {
      verb: 'tail',
      group: 'inspect',
      summary: 'Continuously stream new screen reader announcements in real time',
      cliSubcommand: 'tail',
      cliEquivalent: 'a1 sr tail',
      payloadFields: ['since', 'lines', 'interval', 'phrase'],
   },
   {
      verb: 'list',
      group: 'inspect',
      summary: 'List the named commands sr do accepts',
      cliSubcommand: 'list',
      cliEquivalent: 'a1 sr list',
      payloadFields: ['query', 'sr', 'commandSet'],
   },
   {
      verb: 'cursor',
      group: 'inspect',
      summary: 'Inspect current cursor position and focused element',
      cliSubcommand: 'read',
      cliEquivalent: 'a1 sr read',
   },
   {
      verb: 'spoken',
      group: 'inspect',
      summary: 'Inspect the last spoken phrase or phrase log',
      cliSubcommand: 'transcript',
      cliEquivalent: 'a1 sr transcript',
   },
   {
      verb: 'last',
      group: 'inspect',
      summary: 'Get the most recent announcement',
      cliSubcommand: 'transcript',
      cliEquivalent: 'a1 sr transcript --tail 1',
   },
   {
      verb: 'history',
      group: 'inspect',
      summary: 'Review full or windowed session transcript',
      cliSubcommand: 'transcript',
      cliEquivalent: 'a1 sr transcript',
      payloadFields: ['since', 'tail', 'afterIndex', 'limit'],
   },
   {
      verb: 'tree',
      group: 'inspect',
      summary: 'Inspect accessibility tree structure',
      cliEquivalent: 'a1 tree',
   },
   {
      verb: 'commands',
      group: 'inspect',
      summary: 'List available screen reader commands',
      cliSubcommand: 'list',
      cliEquivalent: 'a1 sr list',
      payloadFields: ['query', 'sr', 'commandSet'],
   },

   // Bulk
   {
      verb: 'walk',
      group: 'bulk',
      summary: 'Walk page hierarchy and collect announcements',
      cliSubcommand: 'walk',
      cliEquivalent: 'a1 sr walk',
      queuedMethods: ['walk'],
   },
   {
      verb: 'batch',
      group: 'bulk',
      summary: 'Execute a JSONL batch of screen reader actions',
      cliSubcommand: 'batch',
      cliEquivalent: 'a1 sr batch',
      payloadFields: ['file'],
   },
];
