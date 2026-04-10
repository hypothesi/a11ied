export {
   BROWSER_POLICY_NAME,
   createBrowserAutomationPolicy,
   detectBrowserAutomationCandidates,
   getBrowserLaunchOptions,
   PLAYWRIGHT_INSTALL_CHROMIUM_COMMAND,
   type BrowserLaunchOptions,
   type BrowserPolicyDeps,
} from './detection.js';
export { launchAutomationBrowser, type BrowserRuntimeDeps } from './runtime.js';
