import { normalizeOsName } from './support-grouping';

export type BrowserFamily = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'WebView';

export const BROWSER_FAMILIES: readonly BrowserFamily[] = [
   'Chrome',
   'Edge',
   'Firefox',
   'Safari',
   'WebView',
];

const BROWSER_ICONS: Readonly<Record<BrowserFamily, string | undefined>> = {
   Chrome: 'logos:chrome',
   Edge: 'logos:microsoft-edge',
   Firefox: 'logos:firefox',
   Safari: 'logos:safari',
   WebView: undefined,
};

const OS_ICONS: Readonly<Record<string, string>> = {
   macOS: 'logos:apple',
   iOS: 'logos:apple',
   Android: 'logos:android-icon',
   Windows: 'logos:microsoft-windows-icon',
};

/** Safari ships only on Apple platforms. */
const SAFARI_PLATFORMS: ReadonlySet<string> = new Set(['macOS', 'iOS']);

export function normalizeBrowserFamily(
   browser: string,
   browserType?: 'browser' | 'webview',
): BrowserFamily | undefined {
   const lower = browser.toLowerCase();

   if (browserType === 'webview' || lower.includes('webview')) {
      return 'WebView';
   }
   if (lower.includes('headless')) {
      return undefined;
   }
   if (lower.includes('edge')) {
      return 'Edge';
   }
   if (lower.includes('chrome') || lower.includes('chromium')) {
      return 'Chrome';
   }
   if (lower.includes('firefox')) {
      return 'Firefox';
   }
   if (lower.includes('safari')) {
      return 'Safari';
   }
   return undefined;
}

export function getBrowserIcon(
   browser: string,
   browserType?: 'browser' | 'webview',
): string | undefined {
   const family = normalizeBrowserFamily(browser, browserType);

   return family ? BROWSER_ICONS[family] : undefined;
}

/** Every icon that a platform icon can show, once each. */
export function listPlatformIcons(): readonly string[] {
   const names = [...Object.values(BROWSER_ICONS), ...Object.values(OS_ICONS)].filter(
      (name): name is string => name !== undefined,
   );

   return [...new Set(names)];
}

export function getOsIcon(os: string): string | undefined {
   return OS_ICONS[normalizeOsName(os)];
}

export function isBrowserAvailable(family: BrowserFamily, os: string): boolean {
   return family !== 'Safari' || SAFARI_PLATFORMS.has(normalizeOsName(os));
}
