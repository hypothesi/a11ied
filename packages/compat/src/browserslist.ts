import browserslist from 'browserslist';
import type {
   BrowserFamily,
   BrowserslistResolveOptions,
   BrowserslistTarget,
   ResolvedBrowserslistResult,
   TargetPlatform,
} from './types.js';

interface BrowserslistFamilyMapping {
   readonly browserFamily: BrowserFamily;
   readonly platform: TargetPlatform;
   readonly expectedScreenReaders: readonly string[];
}

const DEFAULT_QUERY = 'defaults';
const RANGE_DELIMITER = '-';
const VERSION_PAIR_PARTS = 2;

const BROWSERSLIST_FAMILY_MAP: Readonly<Record<string, BrowserslistFamilyMapping>> = {
   chrome: {
      browserFamily: 'chrome',
      platform: 'desktop',
      expectedScreenReaders: ['JAWS', 'NVDA', 'VoiceOver'],
   },
   firefox: {
      browserFamily: 'firefox',
      platform: 'desktop',
      expectedScreenReaders: ['NVDA', 'VoiceOver', 'JAWS'],
   },
   safari: {
      browserFamily: 'safari',
      platform: 'macos',
      expectedScreenReaders: ['VoiceOver'],
   },
   edge: {
      browserFamily: 'edge',
      platform: 'windows',
      expectedScreenReaders: ['JAWS', 'NVDA'],
   },
   and_chr: {
      browserFamily: 'chrome',
      platform: 'android',
      expectedScreenReaders: ['TalkBack'],
   },
   android: {
      browserFamily: 'webview',
      platform: 'android',
      expectedScreenReaders: ['TalkBack'],
   },
   and_ff: {
      browserFamily: 'firefox',
      platform: 'android',
      expectedScreenReaders: ['TalkBack'],
   },
   ios_saf: {
      browserFamily: 'safari',
      platform: 'ios',
      expectedScreenReaders: ['VoiceOver'],
   },
};

export interface ParsedVersionTuple {
   readonly major: number;
   readonly minor: number;
}

/** Parses major/minor numeric version components from version strings or ranges. */
export function parseVersionTuple(versionString: string): ParsedVersionTuple | undefined {
   const trimmed = versionString.trim();
   if (trimmed === '' || trimmed.toLowerCase() === 'pending') {
      return undefined;
   }
   const rangeParts = trimmed.split(RANGE_DELIMITER);
   const candidate = (rangeParts.at(-1) ?? trimmed).trim();
   const match = /^(\d+)(?:\.(\d+))?/u.exec(candidate);
   if (!match?.[1]) {
      return undefined;
   }
   const major = Number.parseInt(match[1], 10);
   const minor = match[VERSION_PAIR_PARTS]
      ? Number.parseInt(match[VERSION_PAIR_PARTS], 10)
      : 0;
   if (Number.isNaN(major) || Number.isNaN(minor)) {
      return undefined;
   }
   return { major, minor };
}

export function compareVersionTuples(
   left: ParsedVersionTuple,
   right: ParsedVersionTuple,
): number {
   if (left.major !== right.major) {
      return left.major - right.major;
   }
   return left.minor - right.minor;
}

export function normalizeScreenReaderName(name: string): string {
   const lower = name.trim().toLowerCase();
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
   if (lower.includes('virtual') || lower.includes('guidepup')) {
      return 'Virtual';
   }
   return name.trim();
}

export function classifyEnvironmentBrowser(
   browserName: string,
   browserType?: 'browser' | 'webview',
): BrowserFamily {
   const lower = browserName.trim().toLowerCase();
   if (browserType === 'webview' || lower.includes('webview')) {
      return 'webview';
   }
   if (lower.includes('chrome') || lower.includes('chromium')) {
      return 'chrome';
   }
   if (lower.includes('firefox')) {
      return 'firefox';
   }
   if (lower.includes('safari')) {
      return 'safari';
   }
   if (lower.includes('edge')) {
      return 'edge';
   }
   return 'other';
}

export function classifyEnvironmentPlatform(osName: string): TargetPlatform {
   const lower = osName.trim().toLowerCase();
   if (lower.includes('mac')) {
      return 'macos';
   }
   if (lower.includes('win')) {
      return 'windows';
   }
   if (lower.includes('android')) {
      return 'android';
   }
   if (lower.includes('ios')) {
      return 'ios';
   }
   return 'other';
}

export function parseBrowserslistEntry(rawEntry: string): BrowserslistTarget {
   const trimmed = rawEntry.trim();
   const parts = trimmed.split(/\s+/u);
   const browserslistID = (parts[0] ?? trimmed).toLowerCase();
   const version = parts.slice(1).join(' ');
   const mapping = BROWSERSLIST_FAMILY_MAP[browserslistID];
   const parsedVersion = parseVersionTuple(version);

   return {
      raw: trimmed,
      browserslistID,
      browserFamily: mapping?.browserFamily ?? 'other',
      platform: mapping?.platform ?? 'other',
      version,
      ...(parsedVersion ? { majorVersion: parsedVersion.major } : {}),
      ...(parsedVersion ? { minorVersion: parsedVersion.minor } : {}),
      expectedScreenReaders: mapping?.expectedScreenReaders ?? [],
   };
}

function buildBrowserslistOptions(
   options?: BrowserslistResolveOptions,
): browserslist.Options {
   return {
      ...(options?.path === undefined ? {} : { path: options.path }),
      ...(options?.env === undefined ? {} : { env: options.env }),
      ...(options?.config === undefined ? {} : { config: options.config }),
   };
}

function resolveQueryLabel(options?: BrowserslistResolveOptions): string {
   if (typeof options?.browserslist === 'string') {
      return options.browserslist;
   }
   if (Array.isArray(options?.browserslist)) {
      return options.browserslist.join(', ');
   }
   const loaded = browserslist.loadConfig({
      ...(options?.path === undefined ? {} : { path: options.path }),
      ...(options?.env === undefined ? {} : { env: options.env }),
      ...(options?.config === undefined ? {} : { config: options.config }),
   });
   return loaded ? loaded.join(', ') : DEFAULT_QUERY;
}

/** Resolves a Browserslist query or project config into structured target metadata. */
export function resolveBrowserslistTargets(
   options?: BrowserslistResolveOptions,
): ResolvedBrowserslistResult {
   const blOptions = buildBrowserslistOptions(options);
   const rawTargets = browserslist(options?.browserslist, blOptions);
   const targets = rawTargets.map((entry) => parseBrowserslistEntry(entry));
   return {
      query: resolveQueryLabel(options),
      rawTargets,
      targets,
   };
}
