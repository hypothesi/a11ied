import {
   deriveOutcomeFromSummary,
   type AssertionBugRef,
   type AssertionResultRecord,
   type FeatureDrilldownItem,
   type FeatureEnvironmentResult,
   type FeatureReport,
   type SideEffectRecord,
   type TestOutcome,
} from '@a11ied/support-data';
import {
   classifyEnvironmentBrowser,
   classifyEnvironmentPlatform,
   normalizeScreenReaderName,
   parseVersionTuple,
   type ParsedVersionTuple,
} from './browserslist.js';
import type {
   BrowserslistTarget,
   MatchPrecision,
   MatchedEnvironmentSummary,
   MatchedEnvironmentSupport,
   TargetPlatform,
   UntestedTargetGap,
} from './types.js';

const MAJOR_DISTANCE_WEIGHT = 1000;

export interface MatchFeatureOptions {
   readonly feature: FeatureReport;
   readonly targets: readonly BrowserslistTarget[];
   readonly includeWebViews?: boolean;
   readonly includeVirtual?: boolean;
   readonly screenReaders?: readonly string[];
   readonly versionMatching?: 'nearest' | 'exact';
}

export interface MatchFeatureResult {
   readonly matchedEnvironments: readonly MatchedEnvironmentSupport[];
   readonly untestedTargets: readonly UntestedTargetGap[];
}

function isPlatformCompatible(
   envPlatform: TargetPlatform,
   targetPlatform: TargetPlatform,
): boolean {
   if (targetPlatform === 'desktop') {
      return envPlatform === 'macos' || envPlatform === 'windows';
   }
   return envPlatform === targetPlatform;
}

function isWebViewCompatible(
   envPlatform: TargetPlatform,
   target: BrowserslistTarget,
): boolean {
   if (envPlatform === 'macos' || envPlatform === 'ios') {
      return target.browserFamily === 'safari';
   }
   if (envPlatform === 'android') {
      return target.browserFamily === 'webview' || target.browserFamily === 'chrome';
   }
   return false;
}

function isEnvironmentCompatibleWithTarget(
   env: FeatureEnvironmentResult,
   target: BrowserslistTarget,
   includeWebViews: boolean,
): boolean {
   const envPlatform = classifyEnvironmentPlatform(env.os);
   if (!isPlatformCompatible(envPlatform, target.platform)) {
      return false;
   }
   if (env.browserType === 'webview') {
      return includeWebViews && isWebViewCompatible(envPlatform, target);
   }
   const envBrowser = classifyEnvironmentBrowser(env.browser, 'browser');
   return envBrowser === target.browserFamily;
}

interface VersionMatchCandidate {
   readonly env: FeatureEnvironmentResult;
   readonly precision: MatchPrecision;
   readonly distance: number;
}

function evaluateVersionMatch(
   env: FeatureEnvironmentResult,
   target: BrowserslistTarget,
   parsedEnv: ParsedVersionTuple | undefined,
): VersionMatchCandidate | undefined {
   if (target.majorVersion === undefined || !parsedEnv) {
      return undefined;
   }
   const targetMinor = target.minorVersion ?? 0;
   const exactMinorMatch =
      !target.version.includes('.') || parsedEnv.minor === targetMinor;
   if (parsedEnv.major === target.majorVersion && exactMinorMatch) {
      return {
         env,
         precision: 'exact',
         distance: 0,
      };
   }
   const signedDiff =
      (parsedEnv.major - target.majorVersion) * MAJOR_DISTANCE_WEIGHT +
      (parsedEnv.minor - targetMinor);
   return {
      env,
      precision: signedDiff < 0 ? 'nearest-older' : 'nearest-newer',
      distance: Math.abs(signedDiff),
   };
}

function selectBestCandidate(
   candidates: readonly VersionMatchCandidate[],
): VersionMatchCandidate | undefined {
   if (candidates.length === 0) {
      return undefined;
   }
   return candidates.toSorted((left, right) => {
      if (left.distance !== right.distance) {
         return left.distance - right.distance;
      }
      if (left.precision === 'nearest-newer' && right.precision !== 'nearest-newer') {
         return -1;
      }
      if (right.precision === 'nearest-newer' && left.precision !== 'nearest-newer') {
         return 1;
      }
      return left.env.source === 'local' ? -1 : 1;
   })[0];
}

function extractBugs(
   failingAssertions: readonly AssertionResultRecord[],
   sideEffects: readonly SideEffectRecord[],
): readonly AssertionBugRef[] {
   const seen = new Set<string>();
   const bugs: AssertionBugRef[] = [];

   for (const item of [...failingAssertions, ...sideEffects]) {
      for (const bug of item.bugs ?? []) {
         const key = `${bug.title}|${bug.url}`;
         if (!seen.has(key)) {
            seen.add(key);
            bugs.push(bug);
         }
      }
   }

   return bugs;
}

function collectFailedAssertions(
   assertions: readonly AssertionResultRecord[],
   target: AssertionResultRecord[],
): void {
   for (const assertion of assertions) {
      if (assertion.verdict === 'fail') {
         target.push(assertion);
      }
   }
}

function collectDrilldownEvidence(
   item: FeatureDrilldownItem,
   failingAssertions: AssertionResultRecord[],
   sideEffects: SideEffectRecord[],
): void {
   if (item.kind === 'local') {
      collectFailedAssertions(item.assertions, failingAssertions);
      return;
   }
   for (const cmd of item.commandResults) {
      collectFailedAssertions(cmd.assertions, failingAssertions);
      sideEffects.push(...cmd.negativeSideEffects);
   }
}

function collectEnvironmentEvidence(env: FeatureEnvironmentResult): {
   readonly outcome: TestOutcome;
   readonly failingAssertions: readonly AssertionResultRecord[];
   readonly sideEffects: readonly SideEffectRecord[];
   readonly bugs: readonly AssertionBugRef[];
} {
   const failingAssertions: AssertionResultRecord[] = [];
   const sideEffects: SideEffectRecord[] = [];

   for (const item of env.items) {
      collectDrilldownEvidence(item, failingAssertions, sideEffects);
   }

   return {
      outcome: deriveOutcomeFromSummary(env.summary),
      failingAssertions,
      sideEffects,
      bugs: extractBugs(failingAssertions, sideEffects),
   };
}

function toEnvironmentSummary(env: FeatureEnvironmentResult): MatchedEnvironmentSummary {
   return {
      source: env.source,
      environmentKey: env.environmentKey,
      environmentID: env.environmentID,
      screenReader: env.screenReader,
      screenReaderVersion: env.screenReaderVersion,
      browser: env.browser,
      browserVersion: env.browserVersion,
      browserType: env.browserType,
      os: env.os,
      osVersion: env.osVersion,
      device: env.device,
      ...(env.testedAt === undefined ? {} : { testedAt: env.testedAt }),
      summary: env.summary,
   };
}

function buildMatchedSupport(
   target: BrowserslistTarget,
   candidate: VersionMatchCandidate,
): MatchedEnvironmentSupport {
   const evidence = collectEnvironmentEvidence(candidate.env);
   return {
      target,
      environment: toEnvironmentSummary(candidate.env),
      rawEnvironment: candidate.env,
      matchPrecision: candidate.precision,
      outcome: evidence.outcome,
      summary: candidate.env.summary,
      failingAssertions: evidence.failingAssertions,
      sideEffects: evidence.sideEffects,
      bugs: evidence.bugs,
   };
}

function resolveCandidateScreenReaders(
   target: BrowserslistTarget,
   allowedSet: ReadonlySet<string> | undefined,
   includeVirtual: boolean,
): readonly string[] {
   const baseList = [...target.expectedScreenReaders];
   if (
      includeVirtual &&
      target.browserFamily === 'chrome' &&
      target.platform === 'desktop'
   ) {
      baseList.push('Virtual');
   }
   if (!allowedSet || allowedSet.size === 0) {
      return baseList;
   }
   return baseList.filter((name) => allowedSet.has(name.toLowerCase()));
}

function buildAllowedScreenReaderSet(
   screenReaders?: readonly string[],
): ReadonlySet<string> | undefined {
   if (!screenReaders || screenReaders.length === 0) {
      return undefined;
   }
   return new Set(
      screenReaders.map((name) => normalizeScreenReaderName(name).toLowerCase()),
   );
}

interface TargetSrMatchOptions {
   readonly feature: FeatureReport;
   readonly target: BrowserslistTarget;
   readonly screenReader: string;
   readonly includeWebViews: boolean;
   readonly exactOnly: boolean;
}

function groupStreamCandidates(
   testedEnvs: readonly FeatureEnvironmentResult[],
   target: BrowserslistTarget,
   exactOnly: boolean,
): Map<string, VersionMatchCandidate[]> {
   const streams = new Map<string, VersionMatchCandidate[]>();
   for (const env of testedEnvs) {
      const parsedEnv = parseVersionTuple(env.browserVersion);
      const candidate = evaluateVersionMatch(env, target, parsedEnv);
      const isAllowed =
         candidate !== undefined && (!exactOnly || candidate.precision === 'exact');
      if (!isAllowed) {
         continue;
      }
      const streamKey = `${classifyEnvironmentPlatform(env.os)}|${env.browserType}`;
      const list = streams.get(streamKey) ?? [];
      list.push(candidate);
      streams.set(streamKey, list);
   }
   return streams;
}

function matchTargetAndScreenReader({
   feature,
   target,
   screenReader,
   includeWebViews,
   exactOnly,
}: TargetSrMatchOptions): {
   readonly matches: readonly MatchedEnvironmentSupport[];
   readonly gap?: UntestedTargetGap;
} {
   const matchingEnvs = feature.versionedEnvironments.filter(
      (env) =>
         normalizeScreenReaderName(env.screenReader) === screenReader &&
         isEnvironmentCompatibleWithTarget(env, target, includeWebViews),
   );

   const testedEnvs = matchingEnvs.filter((env) => env.status === 'tested');
   if (testedEnvs.length === 0) {
      const hasPending = matchingEnvs.some((env) => env.status === 'untested');
      return {
         matches: [],
         gap: {
            target,
            screenReader,
            reason: hasPending
               ? 'Tracked environment is marked pending capture (untested).'
               : 'No tested runs recorded yet for this browser and screen reader combination.',
         },
      };
   }

   const streams = groupStreamCandidates(testedEnvs, target, exactOnly);
   const matches: MatchedEnvironmentSupport[] = [];
   for (const list of streams.values()) {
      const best = selectBestCandidate(list);
      if (best) {
         matches.push(buildMatchedSupport(target, best));
      }
   }

   if (matches.length === 0) {
      return {
         matches: [],
         gap: {
            target,
            screenReader,
            reason: exactOnly
               ? `No exact browser version match for ${target.raw} with ${screenReader}.`
               : `No version-matched run available for ${target.raw} with ${screenReader}.`,
         },
      };
   }

   return { matches };
}

interface CollectTargetState {
   readonly matchedEnvironments: MatchedEnvironmentSupport[];
   readonly untestedTargets: UntestedTargetGap[];
   readonly seenMatchKeys: Set<string>;
}

function appendTargetOutcome(
   state: CollectTargetState,
   target: BrowserslistTarget,
   outcome: {
      readonly matches: readonly MatchedEnvironmentSupport[];
      readonly gap?: UntestedTargetGap;
   },
): void {
   for (const item of outcome.matches) {
      const dedupeKey = `${target.raw}|${item.environment.environmentKey}`;
      if (!state.seenMatchKeys.has(dedupeKey)) {
         state.seenMatchKeys.add(dedupeKey);
         state.matchedEnvironments.push(item);
      }
   }
   if (outcome.gap) {
      state.untestedTargets.push(outcome.gap);
   }
}

/** Matches a feature's versioned runs against resolved Browserslist targets. */
export function matchFeatureToTargets(options: MatchFeatureOptions): MatchFeatureResult {
   const includeWebViews = options.includeWebViews ?? true;
   const includeVirtual = options.includeVirtual ?? false;
   const exactOnly = options.versionMatching === 'exact';
   const allowedSet = buildAllowedScreenReaderSet(options.screenReaders);

   const state: CollectTargetState = {
      matchedEnvironments: [],
      untestedTargets: [],
      seenMatchKeys: new Set<string>(),
   };

   for (const target of options.targets) {
      const candidateSRs = resolveCandidateScreenReaders(
         target,
         allowedSet,
         includeVirtual,
      );
      for (const screenReader of candidateSRs) {
         const outcome = matchTargetAndScreenReader({
            feature: options.feature,
            target,
            screenReader,
            includeWebViews,
            exactOnly,
         });
         appendTargetOutcome(state, target, outcome);
      }
   }

   return {
      matchedEnvironments: state.matchedEnvironments,
      untestedTargets: state.untestedTargets,
   };
}
