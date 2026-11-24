export type TestCategory = 'aria' | 'html' | 'css' | 'js';

export type FeatureType = TestCategory;

export type TestOutcome = 'pass' | 'partial' | 'fail' | 'not-applicable' | 'untested';

export type PlatformGroup =
   | 'macos-voiceover'
   | 'ios-voiceover'
   | 'android-talkback'
   | 'virtual';

export type TestInteractionMode = 'walk' | 'interact';

export type AssertionPriority = 'MUST' | 'SHOULD' | 'MAY';

export type AssertionVerdict = 'pass' | 'fail' | 'untestable' | 'unsupported';

export type SideEffectImpact = 'SEVERE' | 'MODERATE';

export type SpecAssertionRule =
   | {
        readonly kind: 'convey-phrase';
        readonly phrase: string;
        readonly scope?: 'target' | 'any' | 'pre-action' | 'post-action';
        readonly minCount?: number;
     }
   | {
        readonly kind: 'omit-phrase';
        readonly phrase: string;
        readonly scope?: 'target' | 'any' | 'post-action';
     }
   | {
        readonly kind: 'max-occurrences';
        readonly phrase: string;
        readonly max: number;
     }
   | {
        readonly kind: 'convey-role';
        readonly roleHint: string;
     }
   | {
        readonly kind: 'convey-state';
        readonly stateTerm: string;
        readonly scope?: 'target' | 'post-action';
     }
   | {
        readonly kind: 'no-side-effects';
     };

export interface SpecAssertion {
   readonly id: string;
   readonly priority: AssertionPriority;
   readonly statement: string;
   readonly featureRef: string;
   readonly rule: SpecAssertionRule;
}

export interface AssertionBugRef {
   readonly title: string;
   readonly url: string;
}

export interface FeatureRefEntry {
   readonly refId: string;
   readonly type: 'aria' | 'html';
}

export interface AssertionResultRecord {
   readonly id: string;
   readonly priority: AssertionPriority;
   readonly statement: string;
   readonly featureRef?: string;
   readonly featureType?: 'aria' | 'html';
   readonly featureRefs?: readonly FeatureRefEntry[];
   readonly verdict: AssertionVerdict;
   readonly evidence?: string;
   readonly notes?: string;
   readonly bugs?: readonly AssertionBugRef[];
}

export interface PriorityCounts {
   readonly passed: number;
   readonly failed: number;
   readonly untestable: number;
   readonly unsupported: number;
   readonly total: number;
}

export interface AssertionSummary {
   readonly must: PriorityCounts;
   readonly should: PriorityCounts;
   readonly may: PriorityCounts;
   readonly severeSideEffects: number;
   readonly moderateSideEffects: number;
}

export interface SideEffectRecord {
   readonly text: string;
   readonly impact: SideEffectImpact;
   readonly details?: string;
   readonly bugs?: readonly AssertionBugRef[];
}

export interface SpecReference {
   readonly title: string;
   readonly url: string;
   readonly section?: string;
}

/**
 * Uniquely identifies an execution environment across all 7 dimensions that can alter
 * screen reader announcements: device, OS, OS version, browser, browser version, screen
 * reader software, and screen reader software version.
 */
export interface TestEnvironment {
   readonly id: string;
   readonly label: string;
   readonly shortLabel: string;
   readonly platformGroup: PlatformGroup;
   readonly device: string;
   readonly os: string;
   readonly osVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly browserType?: 'browser' | 'webview';
   readonly usageOrder?: number;
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly notes?: string;
}

export interface TranscriptEntry {
   readonly step: number;
   readonly command?: string;
   readonly phrase: string;
   readonly itemText?: string;
   readonly role?: string;
   readonly name?: string;
}

export interface TestRunRecord {
   readonly testSlug: string;
   readonly environmentKey: string;
   readonly environment: TestEnvironment;
   readonly runAt: string;
   readonly driver: string;
   readonly outcome: TestOutcome;
   readonly keyAnnouncement: string;
   readonly notes: string;
   readonly transcript: readonly TranscriptEntry[];
   readonly assertionResults?: readonly AssertionResultRecord[];
   readonly assertionSummary?: AssertionSummary;
}

export interface EnvironmentResultFile {
   readonly schemaVersion: 1;
   readonly environmentKey: string;
   readonly environment: TestEnvironment;
   readonly status: 'tested' | 'untested';
   readonly statusNote?: string;
   readonly runs: readonly TestRunRecord[];
}

export interface TestEvaluationRule {
   readonly mode: TestInteractionMode;
   /** Role substring or keyword used to identify the target line in transcripts. */
   readonly targetRoleHint?: string;
   /** Label used to locate/activate a control during `interact` tests. */
   readonly activateButtonText?: string;
   /**
    * Case-insensitive phrases expected on the target element (or post-action for
    * interact).
    */
   readonly expectedPhrases: readonly string[];
   /** Case-insensitive phrases that indicate the spec rule was violated on the target. */
   readonly forbiddenPhrases?: readonly string[];
   /** Optional state/role terms expected alongside `expectedPhrases` (partial if missing). */
   readonly expectedStateTerms?: readonly string[];
   /** Optional phrases expected BEFORE interaction when mode === 'interact'. */
   readonly preActionExpectedPhrases?: readonly string[];
   /** Minimum number of times an expected phrase should appear (e.g., heading + button). */
   readonly minimumOccurrences?: number;
   /**
    * Maximum allowed occurrences for a non-target phrase (e.g., prohibited generic
    * override).
    */
   readonly maxPhraseOccurrences?: Readonly<Record<string, number>>;
   readonly maxSteps?: number;
}

export interface ScreenReaderTestCase {
   readonly slug: string;
   readonly title: string;
   readonly isolatedTitle: string;
   readonly category: TestCategory;
   readonly featureGroup: string;
   readonly attribute: string;
   readonly tags: readonly string[];
   readonly summary: string;
   readonly expectedBehavior: string;
   readonly specReferences: readonly SpecReference[];
   readonly html: string;
   readonly css?: string;
   readonly js?: string;
   readonly evaluation: TestEvaluationRule;
   readonly assertions?: readonly SpecAssertion[];
}

function normalizeKeySegment(value: string): string {
   return value.trim().toLowerCase().replaceAll(/\s+/gu, '-');
}

/** Builds the canonical unique environment key from all 7 required environment fields. */
export function buildEnvironmentKey(
   environment: Pick<
      TestEnvironment,
      | 'device'
      | 'os'
      | 'osVersion'
      | 'browser'
      | 'browserVersion'
      | 'screenReader'
      | 'screenReaderVersion'
   >,
): string {
   return [
      environment.device,
      environment.os,
      environment.osVersion,
      environment.browser,
      environment.browserVersion,
      environment.screenReader,
      environment.screenReaderVersion,
   ]
      .map((segment) => normalizeKeySegment(segment))
      .join(' | ');
}

export function formatOutcomeLabel(outcome: TestOutcome): string {
   switch (outcome) {
      case 'pass': {
         return 'Pass';
      }
      case 'partial': {
         return 'Partial';
      }
      case 'fail': {
         return 'Fail';
      }
      case 'not-applicable': {
         return 'N/A';
      }
      case 'untested': {
         return 'Untested';
      }
      default: {
         return String(outcome);
      }
   }
}

export function formatCategoryLabel(category: TestCategory): string {
   return category.toUpperCase();
}

export function createEmptyPriorityCounts(): PriorityCounts {
   return {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };
}

interface MutableCounts {
   passed: number;
   failed: number;
   untestable: number;
   unsupported: number;
   total: number;
}

function accumulateCount(target: MutableCounts, verdict: AssertionVerdict): void {
   target.total += 1;
   if (verdict === 'pass') {
      target.passed += 1;
   } else if (verdict === 'fail') {
      target.failed += 1;
   } else if (verdict === 'untestable') {
      target.untestable += 1;
   } else if (verdict === 'unsupported') {
      target.unsupported += 1;
   }
}

export function summarizeAssertions(
   results: readonly Pick<AssertionResultRecord, 'priority' | 'verdict'>[],
   sideEffects: readonly Pick<SideEffectRecord, 'impact'>[] = [],
): AssertionSummary {
   const must: MutableCounts = {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };
   const should: MutableCounts = {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };
   const may: MutableCounts = {
      passed: 0,
      failed: 0,
      untestable: 0,
      unsupported: 0,
      total: 0,
   };

   for (const item of results) {
      if (item.priority === 'MUST') {
         accumulateCount(must, item.verdict);
      } else if (item.priority === 'SHOULD') {
         accumulateCount(should, item.verdict);
      } else {
         accumulateCount(may, item.verdict);
      }
   }

   let moderateSideEffects = 0;
   let severeSideEffects = 0;
   for (const effect of sideEffects) {
      if (effect.impact === 'SEVERE') {
         severeSideEffects += 1;
      } else {
         moderateSideEffects += 1;
      }
   }

   return {
      must,
      should,
      may,
      severeSideEffects,
      moderateSideEffects,
   };
}

export function deriveOutcomeFromSummary(summary: AssertionSummary): TestOutcome {
   if (summary.must.failed > 0 || summary.severeSideEffects > 0) {
      return 'fail';
   }
   if (summary.should.failed > 0 || summary.moderateSideEffects > 0) {
      return 'partial';
   }
   return 'pass';
}
