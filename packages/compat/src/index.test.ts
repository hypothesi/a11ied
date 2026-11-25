import { describe, expect, it } from 'vitest';
import {
   checkCompatibility,
   checkFeatureSupport,
   getFeature,
   getTestCaseOutcomes,
   listSupportedFeatures,
   normalizeFeatureUsage,
   queryEnvironments,
   queryTestCases,
   resolveBrowserslistTargets,
} from './index.js';

const EXPECTED_WEBVIEW_ENV_COUNT = 2;
const EXPECTED_ANDROID_TALKBACK_ENV_COUNT = 3;

describe('@a11ied/compat query API', () => {
   it('normalizes shorthand feature queries and resolves tracked ARIA and HTML features', () => {
      const roleQuery = normalizeFeatureUsage('role="alert"');
      const liveQuery = normalizeFeatureUsage('aria-live');
      const checkedQuery = normalizeFeatureUsage('@checked');
      const cssQuery = normalizeFeatureUsage('css:display-contents');

      expect(roleQuery).toMatchObject({ type: 'aria', featureRef: 'alert' });
      expect(liveQuery).toMatchObject({ type: 'aria', featureRef: 'aria-live' });
      expect(checkedQuery).toMatchObject({ type: 'html', featureRef: '@checked' });
      expect(cssQuery).toMatchObject({ type: 'css', featureRef: 'display-contents' });

      expect(getFeature('role="alert"')?.key).toBe('aria:alert');
      expect(getFeature('aria:aria-labelledby')?.localCases.length).toBeGreaterThan(0);
      expect(getFeature('@checked')?.ariaAtPlans.length).toBeGreaterThan(0);
      expect(listSupportedFeatures({ type: 'html' }).length).toBeGreaterThan(0);
   });

   it('queries versioned local, webview, and W3C ARIA-AT environments and test transcripts', () => {
      const webviews = queryEnvironments({ browserType: 'webview', status: 'tested' });
      const androidTalkback = queryEnvironments({
         os: 'android',
         screenReader: 'TalkBack',
      });
      const w3cReports = queryEnvironments({ source: 'w3c-aria-at' });
      const liveCases = queryTestCases({ attribute: 'aria-live' });
      const outcomes = getTestCaseOutcomes('role-alert-dynamic', { status: 'tested' });

      expect(webviews.length).toBe(EXPECTED_WEBVIEW_ENV_COUNT);
      expect(androidTalkback.length).toBe(EXPECTED_ANDROID_TALKBACK_ENV_COUNT);
      expect(w3cReports.length).toBeGreaterThan(0);
      expect(liveCases.length).toBeGreaterThan(0);
      expect(outcomes.runs.some((run) => run.transcript.length > 0)).toBe(true);
   });

   it('resolves Browserslist queries into structured target metadata', () => {
      const result = resolveBrowserslistTargets({
         browserslist: 'safari >= 17, chrome >= 130, and_chr >= 109, ios_saf >= 18',
      });

      expect(result.query).toContain('safari >= 17');
      expect(result.targets.some((target) => target.browserFamily === 'safari')).toBe(
         true,
      );
      expect(result.targets.some((target) => target.browserFamily === 'chrome')).toBe(
         true,
      );
      expect(result.targets.some((target) => target.platform === 'android')).toBe(true);
      expect(result.targets.some((target) => target.platform === 'ios')).toBe(true);
   });
});

describe('@a11ied/compat Browserslist diagnostics', () => {
   it('checks individual features against Browserslist targets and preserves exact environment versions', () => {
      const describedby = checkFeatureSupport('aria-describedby', {
         browserslist: 'chrome 157, safari 26.3, and_chr 157, ios_saf 18',
      });

      expect(describedby.status).toBe('supported');
      expect(describedby.matchedEnvironments.length).toBeGreaterThan(0);
      expect(
         describedby.matchedEnvironments.every(
            (item) =>
               item.environment.screenReaderVersion.length > 0 &&
               item.environment.browserVersion.length > 0,
         ),
      ).toBe(true);
      expect(
         describedby.untestedTargets.some((gap) => gap.target.platform === 'ios'),
      ).toBe(true);

      const disabled = checkFeatureSupport('aria-disabled', {
         browserslist: 'chrome 157, safari 26.3',
      });
      expect(disabled.status).toBe('partial');

      const labelledby = checkFeatureSupport('aria-labelledby', {
         browserslist: 'chrome 157, safari 26.3',
      });
      expect(labelledby.status).toBe('unsupported');

      const unknown = checkFeatureSupport('css:anchor-name', {
         browserslist: 'defaults',
      });

      expect(unknown.status).toBe('unknown-feature');
   });

   it('emits IDE/linter/bundler diagnostics respecting minPriority, includeWebViews, versionMatching, and reportUntested', () => {
      const fullReport = checkCompatibility({
         browserslist: 'chrome 157, safari 26.3, ios_saf 18',
         reportUntested: true,
         reportUnknownFeatures: true,
         usages: [
            {
               type: 'aria',
               feature: 'aria-live',
               element: '<div aria-live="polite">',
               location: { file: 'src/toast.tsx', line: 12, column: 8 },
            },
            {
               type: 'aria',
               feature: 'alert',
               element: '<div role="alert">',
               location: { file: 'src/banner.tsx', line: 24, column: 5 },
            },
            'css:anchor-name',
         ],
      });

      expect(fullReport.summary.hasErrors).toBe(true);
      expect(fullReport.summary.errors).toBeGreaterThan(0);

      const liveMustError = fullReport.diagnostics.find(
         (diag) =>
            diag.featureKey === 'aria:aria-live' && diag.code === 'a11ied/must-failure',
      );
      expect(liveMustError?.severity).toBe('error');
      expect(liveMustError?.location).toEqual({
         file: 'src/toast.tsx',
         line: 12,
         column: 8,
      });
      expect(liveMustError?.affectedEnvironments.length).toBeGreaterThan(0);

      const noWebView = checkCompatibility({
         browserslist: 'safari 26.3',
         includeWebViews: false,
         usages: ['aria-live'],
      });
      const alertNoWebViewEnv = noWebView.results[0]?.matchedEnvironments ?? [];
      expect(
         alertNoWebViewEnv.every((item) => item.environment.browserType === 'browser'),
      ).toBe(true);

      const exactMismatch = checkFeatureSupport('aria-labelledby', {
         browserslist: 'chrome 120',
         versionMatching: 'exact',
      });
      expect(exactMismatch.matchedEnvironments.length).toBe(0);
      expect(exactMismatch.untestedTargets.length).toBeGreaterThan(0);
   });
});
