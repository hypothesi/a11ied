import {
   deriveOutcomeFromSummary,
   summarizeAssertions,
   type FeatureDrilldownItem,
   type FeatureEnvironmentResult,
   type FeatureReport,
   type TestOutcome,
} from '@a11ied/support-data';
import {
   BROWSER_FAMILIES,
   isBrowserAvailable,
   normalizeBrowserFamily,
   type BrowserFamily,
} from './platforms';
import {
   getOsRank,
   getScreenReaderRank,
   isVirtualScreenReader,
   normalizeOsName,
   normalizeScreenReaderType,
} from './support-grouping';

const MIN_CELLS_TO_RANK = 2,
   ONE_DECIMAL_SCALE = 10,
   PERCENT = 100;

const percentFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

type RatedOutcome = 'pass' | 'partial' | 'fail';

/**
 * Each pair scores the share of its tests that pass fully and partially. The scores are
 * sums of those shares, so dividing by `pairCount` gives the average across pairs.
 */
export interface SupportShare {
   readonly pairCount: number;
   readonly supportedScore: number;
   readonly partialScore: number;
}

export interface SharePercentages {
   readonly supported: string;
   readonly partial: string;
   readonly total: string;
}

interface PairIdentity {
   readonly screenReader: string;
   readonly os: string;
   readonly family: BrowserFamily;
}

interface PairResult extends PairIdentity {
   readonly passShare: number;
   readonly partialShare: number;
}

interface LatestItemResult {
   readonly env: FeatureEnvironmentResult;
   readonly outcome: RatedOutcome;
}

export type MatrixCellState = 'tested' | 'pending' | 'untested' | 'unavailable';

export interface MatrixCell {
   readonly family: BrowserFamily;
   readonly state: MatrixCellState;
   readonly share: SupportShare;
   readonly isBest: boolean;
}

export interface MatrixRow {
   readonly screenReader: string;
   readonly os: string;
   readonly cells: readonly MatrixCell[];
}

interface MatrixContext {
   readonly knownPairs: Set<string>;
   readonly testedPairs: Map<string, PairResult[]>;
}

const EMPTY_SHARE: SupportShare = { pairCount: 0, supportedScore: 0, partialScore: 0 };

function isRatedOutcome(outcome: TestOutcome): outcome is RatedOutcome {
   return outcome === 'pass' || outcome === 'partial' || outcome === 'fail';
}

function getRowKey(screenReader: string, os: string): string {
   return `${screenReader}|${os}`;
}

function getPairKey(pair: PairIdentity): string {
   return `${getRowKey(pair.screenReader, pair.os)}|${pair.family}`;
}

function getPairIdentity(env: FeatureEnvironmentResult): PairIdentity | undefined {
   const family = normalizeBrowserFamily(env.browser, env.browserType);

   if (!family || isVirtualScreenReader(env.screenReader)) {
      return undefined;
   }

   return {
      screenReader: normalizeScreenReaderType(env.screenReader),
      os: normalizeOsName(env.os),
      family,
   };
}

function isNewer(
   candidate: FeatureEnvironmentResult,
   current: FeatureEnvironmentResult,
): boolean {
   const dateOrder = (candidate.testedAt ?? '').localeCompare(current.testedAt ?? '');

   if (dateOrder !== 0) {
      return dateOrder > 0;
   }

   return (
      candidate.browserVersion.localeCompare(current.browserVersion, undefined, {
         numeric: true,
      }) > 0
   );
}

function getItemKey(item: FeatureDrilldownItem): string {
   return item.kind === 'local'
      ? `local|${item.testSlug}`
      : `aria-at|${item.planSlug}|${item.testTitle}`;
}

function getItemOutcome(item: FeatureDrilldownItem): RatedOutcome | undefined {
   if (item.kind === 'local') {
      return isRatedOutcome(item.outcome) ? item.outcome : undefined;
   }

   const assertions = item.commandResults.flatMap((result) => result.assertions);
   const sideEffects = item.commandResults.flatMap(
      (result) => result.negativeSideEffects,
   );
   const outcome = deriveOutcomeFromSummary(summarizeAssertions(assertions, sideEffects));

   return isRatedOutcome(outcome) ? outcome : undefined;
}

function getOutcomeShares(results: ReadonlyMap<string, LatestItemResult>): {
   passShare: number;
   partialShare: number;
} {
   let partialCount = 0,
      passCount = 0;

   for (const result of results.values()) {
      if (result.outcome === 'pass') {
         passCount += 1;
      } else if (result.outcome === 'partial') {
         partialCount += 1;
      }
   }

   return {
      passShare: passCount / results.size,
      partialShare: partialCount / results.size,
   };
}

interface PairEntry {
   readonly identity: PairIdentity;
   readonly items: Map<string, LatestItemResult>;
}

function recordLatestItems(env: FeatureEnvironmentResult, entry: PairEntry): void {
   for (const item of env.items) {
      const itemKey = getItemKey(item);
      const outcome = getItemOutcome(item);
      const current = entry.items.get(itemKey);

      if (outcome && (!current || isNewer(env, current.env))) {
         entry.items.set(itemKey, { env, outcome });
      }
   }
}

/**
 * One score per screen reader, OS, and browser. Different versions of a pair often ran
 * different tests, so each test keeps its most recent result.
 */
function listLatestTestedPairs(feature: FeatureReport): readonly PairResult[] {
   const pairs = new Map<string, PairEntry>();

   for (const env of feature.versionedEnvironments) {
      const identity = env.status === 'tested' ? getPairIdentity(env) : undefined;

      if (identity) {
         const key = getPairKey(identity);
         const entry = pairs.get(key) ?? {
            identity,
            items: new Map<string, LatestItemResult>(),
         };

         recordLatestItems(env, entry);
         pairs.set(key, entry);
      }
   }

   return [...pairs.values()]
      .filter((entry) => entry.items.size > 0)
      .map((entry) => {
         const shares = getOutcomeShares(entry.items);

         return {
            screenReader: entry.identity.screenReader,
            os: entry.identity.os,
            family: entry.identity.family,
            passShare: shares.passShare,
            partialShare: shares.partialShare,
         };
      });
}

function summarizePairs(pairs: readonly PairResult[]): SupportShare {
   let partialScore = 0,
      supportedScore = 0;

   for (const pair of pairs) {
      partialScore += pair.partialShare;
      supportedScore += pair.passShare;
   }

   return { pairCount: pairs.length, supportedScore, partialScore };
}

export function getSupportShare(feature: FeatureReport): SupportShare {
   return summarizePairs(listLatestTestedPairs(feature));
}

export function getShareRatio(share: SupportShare): number {
   return share.pairCount > 0
      ? (share.supportedScore + share.partialScore) / share.pairCount
      : 0;
}

function roundToOneDecimal(value: number): number {
   return Math.round(value * ONE_DECIMAL_SCALE) / ONE_DECIMAL_SCALE;
}

/** Rounds the total first, so the two parts always add up to the total shown. */
export function formatSharePercentages(share: SupportShare): SharePercentages {
   if (share.pairCount === 0) {
      return { supported: '0%', partial: '0%', total: '0%' };
   }

   const total = roundToOneDecimal(getShareRatio(share) * PERCENT);
   const supported = roundToOneDecimal(
      (share.supportedScore / share.pairCount) * PERCENT,
   );
   const partial = Math.max(0, roundToOneDecimal(total - supported));

   return {
      supported: `${percentFormat.format(supported)}%`,
      partial: `${percentFormat.format(partial)}%`,
      total: `${percentFormat.format(total)}%`,
   };
}

function compareRows(left: MatrixRow, right: MatrixRow): number {
   const srOrder =
      getScreenReaderRank(left.screenReader) - getScreenReaderRank(right.screenReader);

   if (srOrder !== 0) {
      return srOrder;
   }

   return getOsRank(left.os) - getOsRank(right.os);
}

function getCellState(pair: PairIdentity, context: MatrixContext): MatrixCellState {
   const key = getPairKey(pair);

   if (context.testedPairs.has(key)) {
      return 'tested';
   }
   if (context.knownPairs.has(key)) {
      return 'pending';
   }
   return isBrowserAvailable(pair.family, pair.os) ? 'untested' : 'unavailable';
}

function buildRow(screenReader: string, os: string, context: MatrixContext): MatrixRow {
   const drafts = BROWSER_FAMILIES.map((family) => {
      const pair = { screenReader, os, family };
      const tested = context.testedPairs.get(getPairKey(pair));

      return {
         family,
         state: getCellState(pair, context),
         share: tested ? summarizePairs(tested) : EMPTY_SHARE,
      };
   });

   const testedRatios = drafts
      .filter((draft) => draft.state === 'tested')
      .map((draft) => getShareRatio(draft.share));
   const bestRatio =
      testedRatios.length >= MIN_CELLS_TO_RANK ? Math.max(...testedRatios) : 0;

   return {
      screenReader,
      os,
      cells: drafts.map((draft) => ({
         family: draft.family,
         state: draft.state,
         share: draft.share,
         isBest:
            bestRatio > 0 &&
            draft.state === 'tested' &&
            getShareRatio(draft.share) === bestRatio,
      })),
   };
}

/**
 * For each screen reader and OS, the share of features that each browser supports. Every
 * feature counts once per browser, with its latest result. The best browser is marked
 * only when a row has at least two tested browsers to compare.
 */
export function buildPairMatrix(
   features: readonly FeatureReport[],
): readonly MatrixRow[] {
   const rows = new Map<string, { screenReader: string; os: string }>();
   const context: MatrixContext = {
      knownPairs: new Set<string>(),
      testedPairs: new Map<string, PairResult[]>(),
   };

   for (const feature of features) {
      for (const env of feature.versionedEnvironments) {
         const pair = getPairIdentity(env);

         if (pair) {
            rows.set(getRowKey(pair.screenReader, pair.os), {
               screenReader: pair.screenReader,
               os: pair.os,
            });
            context.knownPairs.add(getPairKey(pair));
         }
      }

      for (const pair of listLatestTestedPairs(feature)) {
         const key = getPairKey(pair);
         const list = context.testedPairs.get(key) ?? [];

         list.push(pair);
         context.testedPairs.set(key, list);
      }
   }

   return [...rows.values()]
      .map((row) => buildRow(row.screenReader, row.os, context))
      .toSorted(compareRows);
}
