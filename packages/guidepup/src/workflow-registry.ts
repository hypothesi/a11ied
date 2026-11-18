/**
 * Shared Screen Reader Workflow / Verb Metadata Registry.
 *
 * Organizes all high-level SR CLI / MCP verbs into the 6 N4 task groups:
 *
 * - Session: start, stop, status, doctor
 * - Navigate: next, previous, goto, top, bottom, rotor, read
 * - Interact: press, type, click, activate, focus, interact, stop-interacting, perform
 * - Assert: expect, wait, snapshot
 * - Inspect: cursor, spoken, last, history, tree, commands
 * - Bulk: walk, batch
 *
 * Also maps the sr_action MCP tool's action enum values to canonical metadata. Registry
 * data lives in workflow-registry-data.ts; types in workflow-registry-types.ts.
 */

export {
   SR_GROUP_HEADINGS,
   SR_GROUP_ORDER,
   SR_VERB_REGISTRY,
   SR_ACTION_METADATA,
} from './workflow-registry-data.js';

export {
   SR_ACTION_ENUM_VALUES,
   type SrActionEnumValue,
   type SrActionMetadata,
   type SrTaskGroup,
   type SrVerbMetadata,
} from './workflow-registry-types.js';

import {
   SR_ACTION_METADATA,
   SR_GROUP_HEADINGS,
   SR_GROUP_ORDER,
   SR_VERB_REGISTRY,
} from './workflow-registry-data.js';
import {
   SR_ACTION_ENUM_VALUES,
   type SrActionEnumValue,
   type SrActionMetadata,
   type SrTaskGroup,
   type SrVerbMetadata,
} from './workflow-registry-types.js';

/** Legacy alias kept so existing call sites keep working. */
export const SR_TASK_GROUPS = SR_GROUP_ORDER;

export function getSrVerbMetadata(verb: string): SrVerbMetadata | undefined {
   const direct = SR_VERB_REGISTRY.find((entry) => entry.verb === verb);
   if (direct) {
      return direct;
   }
   if (verb in SR_ACTION_METADATA) {
      const actionMeta = SR_ACTION_METADATA[verb as SrActionEnumValue];
      return {
         verb: actionMeta.verb,
         group: actionMeta.group,
         summary: actionMeta.summary,
         cliEquivalent: actionMeta.cliEquivalent,
         payloadFields: actionMeta.payloadFields,
      };
   }
   return undefined;
}

/** Alias of getSrVerbMetadata with the N4 naming. */
export function getSrVerbByName(verb: string): SrVerbMetadata | undefined {
   return getSrVerbMetadata(verb);
}

export function getSrVerbByCliSubcommand(subcommand: string): SrVerbMetadata | undefined {
   return SR_VERB_REGISTRY.find((entry) => entry.cliSubcommand === subcommand);
}

export function getVerbsForGroup(group: SrTaskGroup): readonly SrVerbMetadata[] {
   return SR_VERB_REGISTRY.filter((entry) => entry.group === group);
}

/** Alias of getVerbsForGroup with the N4 naming. */
export function getSrVerbsByGroup(group: SrTaskGroup): readonly SrVerbMetadata[] {
   return getVerbsForGroup(group);
}

export function getRegisteredQueuedMethodNames(): string[] {
   const names = new Set<string>();
   for (const entry of SR_VERB_REGISTRY) {
      for (const method of entry.queuedMethods ?? []) {
         names.add(method);
      }
   }
   return [...names];
}

export function getRegisteredVitestMatcherNames(): string[] {
   const names = new Set<string>();
   for (const entry of SR_VERB_REGISTRY) {
      for (const matcher of entry.vitestMatchers ?? []) {
         names.add(matcher);
      }
   }
   return [...names];
}

export function getSrActionMetadata(action: string): SrActionMetadata | undefined {
   if (action in SR_ACTION_METADATA) {
      return SR_ACTION_METADATA[action as SrActionEnumValue];
   }
   return undefined;
}

export function generateSrActionDescription(): string {
   const actionList = SR_ACTION_ENUM_VALUES.map(
      (action) => `${action} (${SR_ACTION_METADATA[action].summary})`,
   ).join(', ');
   return (
      `Run one action against active sr session (start with sr_session first). Actions: ${actionList}. ` +
      'Returns exitCode 0 on success, or 4 on assertion mismatch.'
   );
}

export function generateSrSessionDescription(): string {
   return (
      'Manage the one active screen reader session (matching a1 sr start/open/stop/status). ' +
      'The session carries targetType (real or simulated). Actions: ' +
      'start: start session on target (voiceover, nvda, virtual; url opens page, app names native app). ' +
      'open: navigate active session to url. ' +
      'stop: stop session (out writes .json/.md transcript). ' +
      'status: read session metadata or { noSession: true }.'
   );
}

export function getSrCliVerbGroupHeading(verb: string): string {
   const meta = getSrVerbMetadata(verb);
   if (meta) {
      return SR_GROUP_HEADINGS[meta.group];
   }
   return SR_GROUP_HEADINGS.inspect;
}
