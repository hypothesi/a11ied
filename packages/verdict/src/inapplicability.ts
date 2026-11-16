import {
   blockerCodeSchema,
   type InapplicabilityKind,
   type ObservationBundle,
} from '@a11ied/contracts';

export interface InapplicabilityCheckResult {
   kind: InapplicabilityKind;
   applicable: boolean;
   inapplicable: boolean;
   reason: string;
   observedCount: number;
}

interface CheckOutput {
   observedCount: number;
   reason: string;
}

const MAX_TREE_DEPTH = 32;
const TABLE_ROLE_PATTERN = /^(table|grid)(?:[\s:".,[]|$)/u;
const AUTH_AUTOCOMPLETE_MARKERS = ['current-password', 'new-password', 'one-time-code'];

function isRecord(value: unknown): value is Record<string, unknown> {
   return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asCount(value: unknown): number {
   if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
   }

   return 0;
}

function asArrayCount(value: unknown): number {
   if (Array.isArray(value)) {
      return value.length;
   }

   return 0;
}

function getFacts(bundle: ObservationBundle): Record<string, unknown> {
   if (isRecord(bundle.facts)) {
      return bundle.facts;
   }

   return {};
}

function getRecord(
   facts: Record<string, unknown>,
   key: string,
): Record<string, unknown> | undefined {
   const value = facts[key];

   if (isRecord(value)) {
      return value;
   }

   return undefined;
}

function countTableLikeSpokenEntries(spokenOrder: readonly string[]): number {
   let count = 0;
   for (const entry of spokenOrder) {
      if (TABLE_ROLE_PATTERN.test(entry.trim().toLowerCase())) {
         count += 1;
      }
   }
   return count;
}

function countTableLikeRoles(value: unknown, depth: number): number {
   if (depth > MAX_TREE_DEPTH) {
      return 0;
   }
   if (Array.isArray(value)) {
      let total = 0;

      for (const entry of value) {
         total += countTableLikeRoles(entry, depth + 1);
      }

      return total;
   }
   if (!isRecord(value)) {
      return 0;
   }

   const role = value.role;
   let count = role === 'table' || role === 'grid' ? 1 : 0;

   for (const child of Object.values(value)) {
      count += countTableLikeRoles(child, depth + 1);
   }

   return count;
}

function summarize(
   observedCount: number,
   absentReason: string,
   presentLabel: string,
): CheckOutput {
   return {
      observedCount,
      reason:
         observedCount === 0
            ? absentReason
            : `${String(observedCount)} ${presentLabel} observed.`,
   };
}

function checkNoMedia(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const media = getRecord(facts, 'media');
   const instrumented = getRecord(facts, 'instrumented');
   const video = asCount(media?.video);
   const audio = asCount(media?.audio);
   const embeds = asArrayCount(media?.embeds);
   const mediaPlays = asCount(instrumented?.mediaPlays);
   const audioContexts = asCount(instrumented?.audioContexts);
   const observedCount = video + audio + embeds + mediaPlays + audioContexts;

   return summarize(
      observedCount,
      'No media elements or playback contexts observed.',
      'media artifact(s)',
   );
}

function isDataEntryControl(roleName: string): boolean {
   return roleName !== 'button' && !roleName.startsWith('button:');
}

function checkNoForm(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const forms = asCount(facts.forms);
   const controls = asArrayCount(facts.controls);
   const formControls = bundle.transcript.formControls.filter(isDataEntryControl).length;
   const observedCount = forms + controls + formControls;

   return summarize(
      observedCount,
      'No forms or data-entry controls observed.',
      'form or data-entry control marker(s)',
   );
}

function checkNoTable(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const tables = asCount(facts.tables);
   const treeRoles = countTableLikeRoles(bundle.tree, 0);
   const spokenOrderRoles = countTableLikeSpokenEntries(bundle.transcript.spokenOrder);
   const observedCount = tables + treeRoles + spokenOrderRoles;

   return summarize(
      observedCount,
      'No structural table markup observed.',
      'table/grid reference(s)',
   );
}

function checkNoLiveRegion(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const liveRegions = asCount(facts.liveRegions);
   const transcriptLiveRegions = bundle.transcript.liveRegions.length;
   const observedCount = liveRegions + transcriptLiveRegions;

   return summarize(observedCount, 'No live regions observed.', 'live region(s)');
}

function checkNoAnimation(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const runningAnimations = asArrayCount(facts.runningAnimations);
   const marquee = asCount(facts.marquee);
   const observedCount = runningAnimations + marquee;

   return summarize(
      observedCount,
      'No running animations or marquees observed.',
      'animation(s)',
   );
}

function checkNoTimedEvent(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const observedCount = facts.metaRefresh ? 1 : 0;

   return summarize(
      observedCount,
      'No metaRefresh timed events observed.',
      'metaRefresh timed event(s)',
   );
}

function checkNoMultipageContext(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const navLinks = asArrayCount(facts.navLinks);
   const observedCount = (bundle.heuristics.hasSiteNavigation ? 1 : 0) + navLinks;

   return summarize(
      observedCount,
      'No site navigation or multipage context observed.',
      'navigation link(s)',
   );
}

function checkNoDragging(bundle: ObservationBundle): CheckOutput {
   const observedCount = bundle.heuristics.hasDraggable ? 1 : 0;

   return summarize(
      observedCount,
      'No draggable targets observed.',
      'draggable target(s)',
   );
}

function checkNoMultipointGesture(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const sliders = asArrayCount(facts.sliders);
   const observedCount = (bundle.heuristics.hasMultipointGesture ? 1 : 0) + sliders;

   return summarize(
      observedCount,
      'No multipoint gestures or sliders observed.',
      'multipoint gesture or slider(s)',
   );
}

function isAuthenticationControl(control: unknown): boolean {
   if (!isRecord(control)) {
      return false;
   }
   if (control.type === 'password') {
      return true;
   }
   const autocomplete = control.autocomplete;

   if (typeof autocomplete !== 'string') {
      return false;
   }
   const normalized = autocomplete.toLowerCase();

   return AUTH_AUTOCOMPLETE_MARKERS.some((marker) => normalized.includes(marker));
}

function checkNoAuthentication(bundle: ObservationBundle): CheckOutput {
   const facts = getFacts(bundle);
   const controls = Array.isArray(facts.controls) ? facts.controls : [];
   let observedCount = 0;
   for (const control of controls) {
      if (isAuthenticationControl(control)) {
         observedCount += 1;
      }
   }

   return summarize(
      observedCount,
      'No authentication or password controls observed.',
      'authentication control(s)',
   );
}

const INAPPLICABILITY_CHECKS: Record<
   InapplicabilityKind,
   (bundle: ObservationBundle) => CheckOutput
> = {
   'media-absence': checkNoMedia,
   'no-media-playback': checkNoMedia,
   'no-form': checkNoForm,
   'no-table': checkNoTable,
   'no-live-region': checkNoLiveRegion,
   'no-animation': checkNoAnimation,
   'no-timed-event': checkNoTimedEvent,
   'no-multipage-context': checkNoMultipageContext,
   'no-dragging': checkNoDragging,
   'no-multipoint-gesture': checkNoMultipointGesture,
   'no-authentication': checkNoAuthentication,
};

/**
 * Runs the table-driven bundle query for an inapplicability kind and reports how many
 * candidate features were observed. The procedure is inapplicable only when the target
 * feature is entirely absent from the bundle.
 */
export function verifyBundleInapplicability(
   bundle: ObservationBundle,
   kind: InapplicabilityKind,
): InapplicabilityCheckResult {
   const { observedCount, reason } = INAPPLICABILITY_CHECKS[kind](bundle);

   return {
      kind,
      applicable: observedCount > 0,
      inapplicable: observedCount === 0,
      reason,
      observedCount,
   };
}

const VALID_BLOCKER_CODES = [
   'capability-unsupported',
   'external-submission-unauthorized',
   'auth-credentials-missing',
   'third-party-out-of-scope',
   'hardware-sensor-unavailable',
   'human-judgment-required',
].join(', ');

/**
 * Validates a cantTell blocker code against the closed BlockerCode enum. Returns a
 * descriptive reason when the code is unknown.
 */
export function validateCantTellBlockerCode(code: string): {
   valid: boolean;
   reason?: string;
} {
   const result = blockerCodeSchema.safeParse(code);

   if (result.success) {
      return { valid: true };
   }

   return {
      valid: false,
      reason: `'${code}' is not a valid blocker code; expected one of: ${VALID_BLOCKER_CODES}.`,
   };
}
