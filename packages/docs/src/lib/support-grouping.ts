import type { FeatureReport } from '@a11ied/support-data';
import type { AssertionSummary } from '@a11ied/support-data/types';

const DATE_PREFIX_LEN = 10;
const MAX_SUMMARY_PLANS = 2;
const SR_ORDER: Readonly<Record<string, number>> = {
   VoiceOver: 0,
   TalkBack: 1,
   NVDA: 2,
   JAWS: 3,
};
const SR_OTHER_RANK = 4;
const SR_VIRTUAL_RANK = 5;
const OS_ORDER: Readonly<Record<string, number>> = {
   macOS: 0,
   iOS: 1,
   Android: 2,
   Windows: 3,
};
const OS_OTHER_RANK = 4;
const BROWSER_CHROME_RANK = 0;
const BROWSER_SAFARI_RANK = 1;
const BROWSER_FIREFOX_RANK = 2;
const BROWSER_OTHER_RANK = 3;
const BROWSER_WEBVIEW_RANK = 4;
const BROWSER_HEADLESS_RANK = 5;

export interface GroupableEnvironmentItem {
   readonly screenReader: string;
   readonly screenReaderVersion: string;
   readonly os: string;
   readonly osVersion: string;
   readonly browser: string;
   readonly browserVersion: string;
   readonly status: 'tested' | 'untested';
}

export interface OsEnvironmentGroup<TItem> {
   readonly os: string;
   readonly items: readonly TItem[];
}

export interface ScreenReaderEnvironmentGroup<TItem> {
   readonly screenReaderType: string;
   readonly isVirtual: boolean;
   readonly totalCount: number;
   readonly testedCount: number;
   readonly osGroups: readonly OsEnvironmentGroup<TItem>[];
}

const SIMULATED_SCREEN_READER = 'Simulated screen reader';

export function isVirtualScreenReader(raw: string): boolean {
   const lower = raw.trim().toLowerCase();
   return lower.includes('virtual') || lower.includes('guidepup');
}

export function normalizeScreenReaderType(raw: string): string {
   const trimmed = raw.trim();
   if (isVirtualScreenReader(trimmed)) {
      return SIMULATED_SCREEN_READER;
   }
   const lower = trimmed.toLowerCase();
   if (lower.includes('voiceover')) {
      return 'VoiceOver';
   }
   if (lower.includes('talkback')) {
      return 'TalkBack';
   }
   if (lower.includes('nvda')) {
      return 'NVDA';
   }
   if (lower.includes('jaws')) {
      return 'JAWS';
   }
   return trimmed;
}

export function normalizeOsName(raw: string): string {
   const trimmed = raw.trim();
   const lower = trimmed.toLowerCase();
   if (lower.includes('macos') || lower === 'mac os' || lower === 'mac') {
      return 'macOS';
   }
   if (lower === 'ios' || lower.includes('iphone') || lower.includes('ipad')) {
      return 'iOS';
   }
   if (lower.includes('android')) {
      return 'Android';
   }
   if (lower.includes('windows')) {
      return 'Windows';
   }
   return trimmed;
}

function getScreenReaderRank(screenReaderType: string): number {
   if (screenReaderType === SIMULATED_SCREEN_READER) {
      return SR_VIRTUAL_RANK;
   }
   return SR_ORDER[screenReaderType] ?? SR_OTHER_RANK;
}

function getOsRank(os: string): number {
   return OS_ORDER[os] ?? OS_OTHER_RANK;
}

function getBrowserRank(browser: string): number {
   const lower = browser.trim().toLowerCase();
   if (lower.includes('headless')) {
      return BROWSER_HEADLESS_RANK;
   }
   if (lower.includes('webview') || lower.includes('wkwebview')) {
      return BROWSER_WEBVIEW_RANK;
   }
   if (lower.includes('chrome')) {
      return BROWSER_CHROME_RANK;
   }
   if (lower.includes('safari')) {
      return BROWSER_SAFARI_RANK;
   }
   if (lower.includes('firefox')) {
      return BROWSER_FIREFOX_RANK;
   }
   return BROWSER_OTHER_RANK;
}

function isRealVersion(rawVersion: string): boolean {
   const lower = rawVersion.trim().toLowerCase();
   return (
      lower.length > 0 &&
      lower !== 'pending' &&
      lower !== 'unknown' &&
      !lower.startsWith('not recorded')
   );
}

function compareVersionsDesc(leftRaw: string, rightRaw: string): number {
   const leftReal = isRealVersion(leftRaw);
   const rightReal = isRealVersion(rightRaw);
   if (leftReal !== rightReal) {
      return leftReal ? -1 : 1;
   }
   return rightRaw.trim().localeCompare(leftRaw.trim(), undefined, { numeric: true });
}

interface InternalEntry<TItem> {
   readonly item: TItem;
   readonly meta: GroupableEnvironmentItem;
}

function compareEntries<TItem>(
   left: InternalEntry<TItem>,
   right: InternalEntry<TItem>,
): number {
   if (left.meta.status !== right.meta.status) {
      return left.meta.status === 'tested' ? -1 : 1;
   }

   const osVerCmp = compareVersionsDesc(left.meta.osVersion, right.meta.osVersion);
   if (osVerCmp !== 0) {
      return osVerCmp;
   }

   const leftBrowserRank = getBrowserRank(left.meta.browser);
   const rightBrowserRank = getBrowserRank(right.meta.browser);
   if (leftBrowserRank !== rightBrowserRank) {
      return leftBrowserRank - rightBrowserRank;
   }

   const browserVerCmp = compareVersionsDesc(
      left.meta.browserVersion,
      right.meta.browserVersion,
   );
   if (browserVerCmp !== 0) {
      return browserVerCmp;
   }

   return compareVersionsDesc(
      left.meta.screenReaderVersion,
      right.meta.screenReaderVersion,
   );
}

export function groupByScreenReaderAndOs<TItem>(
   items: readonly TItem[],
   extract: (item: TItem) => GroupableEnvironmentItem,
): readonly ScreenReaderEnvironmentGroup<TItem>[] {
   const srMap = new Map<string, Map<string, InternalEntry<TItem>[]>>();

   for (const item of items) {
      const meta = extract(item);
      const srType = normalizeScreenReaderType(meta.screenReader);
      const osName = normalizeOsName(meta.os);

      let osMap = srMap.get(srType);
      if (!osMap) {
         osMap = new Map<string, InternalEntry<TItem>[]>();
         srMap.set(srType, osMap);
      }

      let bucket = osMap.get(osName);
      if (!bucket) {
         bucket = [];
         osMap.set(osName, bucket);
      }

      bucket.push({ item, meta });
   }

   const srKeys = [...srMap.keys()].toSorted((left, right) => {
      const rankDiff = getScreenReaderRank(left) - getScreenReaderRank(right);
      if (rankDiff !== 0) {
         return rankDiff;
      }
      return left.localeCompare(right);
   });

   return srKeys.map((screenReaderType) => {
      const osMap =
         srMap.get(screenReaderType) ?? new Map<string, InternalEntry<TItem>[]>();
      const osKeys = [...osMap.keys()].toSorted((left, right) => {
         const rankDiff = getOsRank(left) - getOsRank(right);
         if (rankDiff !== 0) {
            return rankDiff;
         }
         return left.localeCompare(right);
      });

      let totalCount = 0;
      let testedCount = 0;

      const osGroups: OsEnvironmentGroup<TItem>[] = osKeys.map((os) => {
         const sorted = (osMap.get(os) ?? []).toSorted(compareEntries);
         totalCount += sorted.length;
         testedCount += sorted.filter((entry) => entry.meta.status === 'tested').length;
         return {
            os,
            items: sorted.map((entry) => entry.item),
         };
      });

      return {
         screenReaderType,
         isVirtual: screenReaderType === SIMULATED_SCREEN_READER,
         totalCount,
         testedCount,
         osGroups,
      };
   });
}

export function formatRowOsVersion(os: string, osVersion: string): string {
   const osLabel = normalizeOsName(os);
   const trimmedVer = osVersion.trim();
   const lowerVer = trimmedVer.toLowerCase();
   if (lowerVer === '' || lowerVer.startsWith('not recorded')) {
      return osLabel;
   }
   if (lowerVer === 'pending') {
      return `${osLabel} (Pending)`;
   }
   return `${osLabel} ${trimmedVer}`;
}

export function formatRowBrowser(browser: string, browserVersion: string): string {
   const browserLabel = browser.trim();
   const trimmedVer = browserVersion.trim();
   const lowerVer = trimmedVer.toLowerCase();
   if (lowerVer === '' || lowerVer === 'pending' || lowerVer.startsWith('not recorded')) {
      return `${browserLabel} (Pending)`;
   }
   return `${browserLabel} ${trimmedVer}`;
}

export function formatCompactRatio(summary: AssertionSummary, isTested: boolean): string {
   if (!isTested) {
      return '';
   }
   if (summary.must.total > 0) {
      return `${String(summary.must.passed)}/${String(summary.must.total)} MUST`;
   }
   if (summary.should.total > 0) {
      return `${String(summary.should.passed)}/${String(summary.should.total)} SHOULD`;
   }
   if (summary.may.total > 0) {
      return `${String(summary.may.passed)}/${String(summary.may.total)} MAY`;
   }
   return '';
}

export function formatFeatureSummary(feature: FeatureReport): string {
   const firstLocalSummary = feature.localCases[0]?.summary;
   if (firstLocalSummary) {
      return firstLocalSummary;
   }
   if (feature.ariaAtPlans.length > 0) {
      const titles = feature.ariaAtPlans
         .slice(0, MAX_SUMMARY_PLANS)
         .map((plan) => plan.title)
         .join(', ');
      const extra = feature.ariaAtPlans.length - MAX_SUMMARY_PLANS;
      const suffix = extra > 0 ? `, +${String(extra)} more` : '';
      return `Screen reader support for ${feature.title} across ${titles}${suffix}.`;
   }
   return `Screen reader support for ${feature.title}.`;
}

const MISSING_VERSION = /^(pending|not recorded)/i;

/**
 * A version of "Pending" or "Not recorded ..." is a gap in the data, so only the name is
 * shown.
 */
export function formatNameAndVersion(name: string, version: string): string {
   return MISSING_VERSION.test(version.trim()) ? name : `${name} ${version}`.trim();
}

/**
 * Some runs recorded the version of the automation driver, such as "0.0.1-VoiceOver4",
 * where the screen reader's own version belongs. That is not a version a reader can use.
 */
export function formatScreenReader(name: string, version: string): string {
   const product = name.split(' ')[0] ?? name;
   const isDriverVersion = version.toLowerCase().includes(product.toLowerCase());
   return isDriverVersion ? name : formatNameAndVersion(name, version);
}

const LICENSE_NAME_AND_URL = /^(?<name>.+?)\s*\((?<url>https?:\/\/[^)\s]+)\)$/;

/** Splits a license recorded as "Name (address)" so a page can link the name. */
export function parseLicense(license: string): { name: string; url: string | undefined } {
   const parts = LICENSE_NAME_AND_URL.exec(license)?.groups;
   return { name: parts?.name ?? license, url: parts?.url };
}

export function escapeHtml(text: string): string {
   return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
}

export function formatShortDate(iso?: string): string {
   if (!iso) {
      return 'Pending';
   }
   return iso.slice(0, DATE_PREFIX_LEN);
}
