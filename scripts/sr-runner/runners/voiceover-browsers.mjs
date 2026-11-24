import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const WKWEBVIEW_SWIFT = resolve(
   import.meta.dirname,
   '..',
   'webviews',
   'macos-wkwebview.swift',
);

const CHROME_VIEWPORT_WIDTH = 920;
const CHROME_VIEWPORT_HEIGHT = 640;
const INITIAL_CLICK_POS = 4;
const SETTLE_AFTER_NAV_MS = 500;
const FOCUS_SETTLE_MS = 200;
const PROCESS_FOCUS_SETTLE_MS = 250;
const APPLESCRIPT_DEFAULT_TIMEOUT_MS = 6000;
const SAFARI_WAIT_TIMEOUT_MS = 5000;
const SAFARI_URL_POLL_MS = 100;
const SAFARI_WINDOW_POLL_MS = 150;
const SAFARI_OPEN_SETTLE_MS = 400;
const SAFARI_FOCUS_SETTLE_MS = 300;
const SAFARI_CLOSE_SETTLE_MS = 250;
const SAFARI_APPLE_SCRIPT_TIMEOUT_MS = 4000;
const SAFARI_LAUNCH_TIMEOUT_MS = 4500;
const BIDI_CONNECT_DEADLINE_MS = 12_000;
const BIDI_SOCKET_TIMEOUT_MS = 1500;
const BIDI_RETRY_DELAY_MS = 200;
const WKWEBVIEW_SIGNAL_TIMEOUT_MS = 8000;
const FIREFOX_CLOSE_DELAY_MS = 300;

export function delay(ms) {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

export function ignoreError(error) {
   return error;
}

export function readMacOSInfo() {
   const osVersion = execFileSync('sw_vers', ['-productVersion'], {
      encoding: 'utf8',
   }).trim();
   let device = `Mac (${process.arch})`;
   try {
      const hw = execFileSync('system_profiler', ['SPHardwareDataType'], {
         encoding: 'utf8',
      });
      const modelMatch = /Model Name:\s*(.+)/u.exec(hw);
      const chipMatch = /Chip:\s*(.+)/u.exec(hw);
      if (modelMatch?.[1] && chipMatch?.[1]) {
         device = `${modelMatch[1].trim()} (${chipMatch[1].trim()})`;
      } else if (modelMatch?.[1]) {
         device = modelMatch[1].trim();
      }
   } catch {
      return { osVersion: `${osVersion} (${process.arch})`, device };
   }
   return {
      osVersion: `${osVersion} (${process.arch})`,
      device,
   };
}

function readPlistKey(plistPath, key) {
   try {
      return execFileSync('defaults', ['read', plistPath, key], {
         encoding: 'utf8',
      }).trim();
   } catch {
      return 'unknown';
   }
}

function runAppleScript(lines, timeoutMs = APPLESCRIPT_DEFAULT_TIMEOUT_MS) {
   const args = lines.flatMap((line) => ['-e', line]);
   return execFileSync('osascript', args, {
      encoding: 'utf8',
      timeout: timeoutMs,
   }).trim();
}

function escapeAppleScriptString(value) {
   return value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);
}

function focusWindowByTitle(bundleID, windowTitle) {
   const escapedTitle = escapeAppleScriptString(windowTitle);
   try {
      runAppleScript([
         'tell application "System Events"',
         `repeat with p in (every process whose bundle identifier is "${bundleID}")`,
         'try',
         'repeat with w in windows of p',
         `if name of w contains "${escapedTitle}" then`,
         'set frontmost of p to true',
         'perform action "AXRaise" of w',
         'return "focused"',
         'end if',
         'end repeat',
         'end try',
         'end repeat',
         'end tell',
      ]);
   } catch {
      return false;
   }
   return true;
}

function focusProcessByPid(pid) {
   try {
      runAppleScript([
         'tell application "System Events"',
         `set frontmost of (first process whose unix id is ${String(pid)}) to true`,
         'end tell',
      ]);
   } catch {
      return false;
   }
   return true;
}

async function createChromeBrowserSession(playwrightEntry) {
   const { chromium } = await import(playwrightEntry);
   const browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: [
         '--no-first-run',
         '--no-default-browser-check',
         '--disable-extensions',
         '--disable-default-apps',
         '--window-size=960,760',
         '--window-position=80,80',
      ],
   });
   const context = await browser.newContext({
      viewport: { width: CHROME_VIEWPORT_WIDTH, height: CHROME_VIEWPORT_HEIGHT },
   });
   const page = await context.newPage();
   await page.goto('about:blank');

   return {
      browserName: 'Google Chrome',
      browserVersion: browser.version(),
      browserType: 'browser',
      async openCase(url, isolatedTitle) {
         await page.goto(url, { waitUntil: 'load' });
         await page.bringToFront();
         await page.mouse.click(INITIAL_CLICK_POS, INITIAL_CLICK_POS).catch(ignoreError);
         await delay(SETTLE_AFTER_NAV_MS);
         focusWindowByTitle('com.google.Chrome', isolatedTitle);
         await delay(FOCUS_SETTLE_MS);
      },
      async close() {
         await browser.close().catch(ignoreError);
      },
   };
}

function listSafariWindowsViaSystemEvents() {
   try {
      const output = runAppleScript(
         [
            'tell application "System Events"',
            'if not (exists process "Safari") then return ""',
            'tell process "Safari"',
            'set windowNames to name of every window',
            String.raw`set AppleScript's text item delimiters to "||"`,
            'return windowNames as text',
            'end tell',
            'end tell',
         ],
         SAFARI_APPLE_SCRIPT_TIMEOUT_MS,
      );
      if (!output) {
         return [];
      }
      return output
         .split('||')
         .map((name) => name.trim())
         .filter(Boolean);
   } catch {
      return [];
   }
}

function closeSafariAXWindow(title) {
   try {
      const escapedPrev = escapeAppleScriptString(title);
      runAppleScript(
         [
            'tell application "System Events"',
            'tell process "Safari"',
            `repeat with w in (every window whose name contains "${escapedPrev}")`,
            'try',
            'click (first button of w whose subrole is "AXCloseButton")',
            'end try',
            'end repeat',
            'end tell',
            'end tell',
         ],
         SAFARI_APPLE_SCRIPT_TIMEOUT_MS,
      );
   } catch {
      return false;
   }
   return true;
}

async function waitForSafariURL(winId, url, deadline) {
   const currentURL = runAppleScript([
      'tell application "Safari"',
      `return URL of current tab of window id ${winId}`,
      'end tell',
   ]);
   if (currentURL.startsWith(url) || Date.now() >= deadline) {
      return;
   }
   await delay(SAFARI_URL_POLL_MS);
   await waitForSafariURL(winId, url, deadline);
}

async function waitForSafariWindowTitle(isolatedTitle, deadline) {
   const windows = listSafariWindowsViaSystemEvents();
   if (windows.some((name) => name.includes(isolatedTitle)) || Date.now() >= deadline) {
      return;
   }
   await delay(SAFARI_WINDOW_POLL_MS);
   await waitForSafariWindowTitle(isolatedTitle, deadline);
}

async function createSafariSession() {
   let safariAppleScriptWorks = false;
   let winId = '';

   const existingWindows = listSafariWindowsViaSystemEvents();
   const hasPersonalWindows = existingWindows.some(
      (name) => name !== 'Start Page' && name !== 'Untitled',
   );

   try {
      winId = runAppleScript(
         [
            'tell application "Safari"',
            'activate',
            'make new document with properties {URL:"about:blank"}',
            'set winId to id of front window',
            'set bounds of window id winId to {80, 80, 1040, 800}',
            'return winId as text',
            'end tell',
         ],
         SAFARI_LAUNCH_TIMEOUT_MS,
      );
      safariAppleScriptWorks = winId !== '';
   } catch (error) {
      if (hasPersonalWindows) {
         const message = error instanceof Error ? error.message : String(error);
         throw new Error(
            `Safari has open non-test windows and Safari AppleScript automation timed out (${message}).`,
            { cause: error },
         );
      }
   }

   let openedTestTitle = '';

   return {
      browserName: 'Safari',
      browserVersion: readPlistKey(
         '/Applications/Safari.app/Contents/Info.plist',
         'CFBundleShortVersionString',
      ),
      browserType: 'browser',
      async openCase(url, isolatedTitle) {
         if (safariAppleScriptWorks) {
            runAppleScript([
               'tell application "Safari"',
               'activate',
               `set URL of current tab of window id ${winId} to "${url}"`,
               `set index of window id ${winId} to 1`,
               'end tell',
            ]);
            await waitForSafariURL(winId, url, Date.now() + SAFARI_WAIT_TIMEOUT_MS);
            await delay(SETTLE_AFTER_NAV_MS);
            focusWindowByTitle('com.apple.Safari', isolatedTitle);
            await delay(FOCUS_SETTLE_MS);
            return;
         }

         if (openedTestTitle) {
            closeSafariAXWindow(openedTestTitle);
            await delay(SAFARI_CLOSE_SETTLE_MS);
         }

         execFileSync('open', ['-a', 'Safari', url], {
            timeout: APPLESCRIPT_DEFAULT_TIMEOUT_MS,
         });
         openedTestTitle = isolatedTitle;
         await waitForSafariWindowTitle(
            isolatedTitle,
            Date.now() + SAFARI_WAIT_TIMEOUT_MS,
         );
         await delay(SAFARI_OPEN_SETTLE_MS);
         focusWindowByTitle('com.apple.Safari', isolatedTitle);
         await delay(SAFARI_FOCUS_SETTLE_MS);
      },
      async close() {
         if (safariAppleScriptWorks && winId) {
            try {
               runAppleScript([
                  'tell application "Safari"',
                  `close window id ${winId}`,
                  'end tell',
               ]);
            } catch {
               return;
            }
            return;
         }
         if (openedTestTitle) {
            closeSafariAXWindow(openedTestTitle);
         }
      },
   };
}

function getFreePort() {
   return new Promise((resolvePort, rejectPort) => {
      const srv = createServer();
      srv.listen(0, '127.0.0.1', () => {
         const addr = srv.address();
         const port = typeof addr === 'object' && addr ? addr.port : 0;
         srv.close(() => resolvePort(port));
      });
      srv.once('error', rejectPort);
   });
}

function attemptBiDiWebSocket(port) {
   return new Promise((resolveWs, rejectWs) => {
      const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/session`);
      const timer = setTimeout(() => {
         socket.close();
         rejectWs(new Error('WebSocket connect timeout'));
      }, BIDI_SOCKET_TIMEOUT_MS);
      socket.addEventListener('open', () => {
         clearTimeout(timer);
         resolveWs(socket);
      });
      socket.addEventListener('error', () => {
         clearTimeout(timer);
         rejectWs(new Error('WebSocket connect failed'));
      });
   });
}

async function pollBiDiSocket(port, deadline) {
   try {
      return await attemptBiDiWebSocket(port);
   } catch {
      if (Date.now() >= deadline) {
         throw new Error('Could not connect to Firefox WebDriver BiDi port.');
      }
      await delay(BIDI_RETRY_DELAY_MS);
      return pollBiDiSocket(port, deadline);
   }
}

async function connectBiDi(port) {
   const ws = await pollBiDiSocket(port, Date.now() + BIDI_CONNECT_DEADLINE_MS);
   let nextID = 0;
   const pending = new Map();

   ws.addEventListener('message', (event) => {
      const msg = JSON.parse(String(event.data));
      if (msg.id !== undefined && pending.has(msg.id)) {
         const { resolveMsg, rejectMsg } = pending.get(msg.id);
         pending.delete(msg.id);
         if (msg.type === 'error') {
            rejectMsg(new Error(`${msg.error}: ${msg.message}`));
         } else {
            resolveMsg(msg.result);
         }
      }
   });

   function send(method, params = {}) {
      nextID += 1;
      const id = nextID;
      return new Promise((resolveMsg, rejectMsg) => {
         pending.set(id, { resolveMsg, rejectMsg });
         ws.send(JSON.stringify({ id, method, params }));
      });
   }

   await send('session.new', { capabilities: {} });
   return { send, close: () => ws.close() };
}

async function createFirefoxBrowserSession() {
   const firefoxBin = '/Applications/Firefox.app/Contents/MacOS/firefox';
   if (!existsSync(firefoxBin)) {
      throw new Error(`Firefox executable not found at ${firefoxBin}`);
   }
   const profileDir = mkdtempSync(resolve(tmpdir(), 'sr-firefox-'));
   writeFileSync(
      resolve(profileDir, 'user.js'),
      [
         'user_pref("browser.shell.checkDefaultBrowser", false);',
         'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);',
         'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
         'user_pref("browser.startup.homepage_override.mstone", "ignore");',
         'user_pref("browser.tabs.warnOnClose", false);',
         'user_pref("browser.aboutwelcome.enabled", false);',
         'user_pref("browser.newtabpage.enabled", false);',
         'user_pref("accessibility.force_disabled", -1);',
      ].join('\n'),
      'utf8',
   );

   const port = await getFreePort();
   const child = spawn(
      firefoxBin,
      [
         '--no-remote',
         '--profile',
         profileDir,
         '--remote-debugging-port',
         String(port),
         '--width',
         '960',
         '--height',
         '720',
         'about:blank',
      ],
      { stdio: 'ignore' },
   );

   const bidi = await connectBiDi(port);
   const tree = await bidi.send('browsingContext.getTree', {});
   const contextID = tree.contexts?.[0]?.context;
   if (!contextID) {
      throw new Error('Firefox BiDi did not return an initial browsing context.');
   }

   return {
      browserName: 'Firefox',
      browserVersion: readPlistKey(
         '/Applications/Firefox.app/Contents/Info.plist',
         'CFBundleShortVersionString',
      ),
      browserType: 'browser',
      async openCase(url, isolatedTitle) {
         await bidi.send('browsingContext.navigate', {
            context: contextID,
            url,
            wait: 'complete',
         });
         await bidi
            .send('input.performActions', {
               context: contextID,
               actions: [
                  {
                     type: 'pointer',
                     id: 'mouse',
                     parameters: { pointerType: 'mouse' },
                     actions: [
                        Object.fromEntries([
                           ['type', 'pointerMove'],
                           ['x', INITIAL_CLICK_POS],
                           ['y', INITIAL_CLICK_POS],
                        ]),
                        { type: 'pointerDown', button: 0 },
                        { type: 'pointerUp', button: 0 },
                     ],
                  },
               ],
            })
            .catch(ignoreError);
         await delay(SETTLE_AFTER_NAV_MS);
         focusProcessByPid(child.pid);
         focusWindowByTitle('org.mozilla.firefox', isolatedTitle);
         await delay(PROCESS_FOCUS_SETTLE_MS);
      },
      async close() {
         bidi.close();
         child.kill('SIGTERM');
         await delay(FIREFOX_CLOSE_DELAY_MS);
         rmSync(profileDir, { recursive: true, force: true });
      },
   };
}

function buildWKWebViewApp() {
   const appDir = '/tmp/sr-wkwebview/SRWebView.app';
   const macOSDir = resolve(appDir, 'Contents', 'MacOS');
   const binPath = resolve(macOSDir, 'SRWebView');
   const plistPath = resolve(appDir, 'Contents', 'Info.plist');

   mkdirSync(macOSDir, { recursive: true });
   writeFileSync(
      plistPath,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
   <key>CFBundleIdentifier</key>
   <string>dev.a11ied.sr-wkwebview</string>
   <key>CFBundleName</key>
   <string>SRWebView</string>
   <key>CFBundleExecutable</key>
   <string>SRWebView</string>
   <key>NSAppTransportSecurity</key>
   <dict>
      <key>NSAllowsLocalNetworking</key>
      <true/>
   </dict>
</dict>
</plist>
`,
      'utf8',
   );

   execFileSync('swiftc', [WKWEBVIEW_SWIFT, '-o', binPath]);
   return binPath;
}

async function createWKWebViewSession() {
   const binPath = buildWKWebViewApp();
   const child = spawn(binPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
   let lineBuffer = '';
   const waiters = [];

   child.stdout.on('data', (chunk) => {
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
         const waiter = waiters.shift();
         if (waiter) {
            waiter(line.trim());
         }
      }
   });

   function waitForSignal(timeoutMs = WKWEBVIEW_SIGNAL_TIMEOUT_MS) {
      return new Promise((resolveSignal, rejectSignal) => {
         const timer = setTimeout(() => {
            rejectSignal(new Error('WKWebView harness did not respond in time.'));
         }, timeoutMs);
         waiters.push((line) => {
            clearTimeout(timer);
            resolveSignal(line);
         });
      });
   }

   await waitForSignal();
   const webkitVersion = readPlistKey(
      '/System/Library/Frameworks/WebKit.framework/Versions/A/Resources/Info.plist',
      'CFBundleShortVersionString',
   );

   return {
      browserName: 'WKWebView (macOS WebKit)',
      browserVersion: webkitVersion,
      browserType: 'webview',
      async openCase(url) {
         const loadedPromise = waitForSignal();
         child.stdin.write(`${url}\n`);
         await loadedPromise;
         await delay(SETTLE_AFTER_NAV_MS);
         focusProcessByPid(child.pid);
         await delay(FOCUS_SETTLE_MS);
      },
      async close() {
         try {
            child.stdin.write('QUIT\n');
            child.stdin.end();
         } catch {
            // Closed pipe already terminated child.
         }
         await delay(PROCESS_FOCUS_SETTLE_MS);
         if (!child.killed) {
            child.kill('SIGTERM');
         }
      },
   };
}

export async function createBrowserSession(browser, playwrightEntry) {
   if (browser === 'chrome') {
      return createChromeBrowserSession(playwrightEntry);
   }
   if (browser === 'safari') {
      return createSafariSession();
   }
   if (browser === 'firefox') {
      return createFirefoxBrowserSession();
   }
   if (browser === 'wkwebview') {
      return createWKWebViewSession();
   }
   throw new Error(`Unsupported macOS browser target: "${browser}".`);
}
