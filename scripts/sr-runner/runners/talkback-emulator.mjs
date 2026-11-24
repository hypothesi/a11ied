import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const { env: processEnv } = process;

const DEFAULT_AVD_NAME = 'a11y_TalkBack_33';
const BOOT_TIMEOUT_MS = 120_000;
const BOOT_POLL_MS = 2000;
const POST_BOOT_SETTLE_MS = 4500;
const NAV_SETTLE_MS = 2800;
const WEBVIEW_NAV_SETTLE_MS = 3800;
const EMU_CMD_TIMEOUT_MS = 2000;
const LOGCAT_MAX_BYTES = 67_108_864;
const CRASH_DISMISS_DELAY_MS = 900;
const CRASH_MAX_ATTEMPTS = 3;
const CHROME_ONBOARDING_SETTLE_MS = 1500;
const CHROME_ONBOARDING_STEP_DELAY_MS = 1200;
const CHROME_RELAUNCH_SETTLE_MS = 2000;
const CHROME_ONBOARDING_MAX_STEPS = 5;
const BANNER_DRAIN_MS = 100;
const TOUCH_EXPLORE_TAP_MS = 40;
const DOUBLE_TAP_HOLD_MS = 25;
const DOUBLE_TAP_GAP_MS = 80;
const SWIPE_Y_RATIO = 0.52;
const SWIPE_RATIO_1 = 0.18;
const SWIPE_RATIO_2 = 0.3;
const SWIPE_RATIO_3 = 0.42;
const SWIPE_RATIO_4 = 0.54;
const SWIPE_RATIO_5 = 0.67;
const SWIPE_RATIO_6 = 0.8;
const SWIPE_X_RATIOS = [
   SWIPE_RATIO_1,
   SWIPE_RATIO_2,
   SWIPE_RATIO_3,
   SWIPE_RATIO_4,
   SWIPE_RATIO_5,
   SWIPE_RATIO_6,
];
const SWIPE_STEP_MS = 18;
const DOUBLE_TAP_RATIO = 0.5;
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 2400;
const USAGE_FALLBACK = 99;
const MIDPOINT_DIVISOR = 2;
const REGEX_GROUP_Y1 = 2;
const REGEX_GROUP_X2 = 3;
const REGEX_GROUP_Y2 = 4;

const ANDROID_USAGE_ORDER = {
   chrome: 1,
   firefox: 2,
   webview: 3,
};

export function delay(ms) {
   return new Promise((resolvePromise) => {
      setTimeout(resolvePromise, ms);
   });
}

export function ignoreError(error) {
   return error;
}

function findEmulatorBinary() {
   const candidates = [
      processEnv.ANDROID_HOME
         ? resolve(processEnv.ANDROID_HOME, 'emulator', 'emulator')
         : '',
      processEnv.ANDROID_SDK_ROOT
         ? resolve(processEnv.ANDROID_SDK_ROOT, 'emulator', 'emulator')
         : '',
      resolve(homedir(), 'Library', 'Android', 'sdk', 'emulator', 'emulator'),
   ].filter(Boolean);

   for (const candidate of candidates) {
      if (existsSync(candidate)) {
         return candidate;
      }
   }
   return 'emulator';
}

export async function runAdb(serial, args) {
   const prefix = serial ? ['-s', serial] : [];
   const { stdout } = await execFileAsync('adb', [...prefix, ...args], {
      maxBuffer: LOGCAT_MAX_BYTES,
   });
   return stdout.trim();
}

function listAttachedEmulators() {
   const raw = execFileSync('adb', ['devices'], { encoding: 'utf8' });
   return raw
      .split('\n')
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line.endsWith('\tdevice') || line.endsWith(' device'))
      .map((line) => line.split(/\s+/u)[0])
      .filter(Boolean);
}

async function pollEmulatorBoot(beforeSet, deadline) {
   const current = listAttachedEmulators();
   const newlyAttached = current.find((id) => !beforeSet.has(id));
   if (newlyAttached) {
      const bootDone = await runAdb(newlyAttached, [
         'shell',
         'getprop',
         'sys.boot_completed',
      ]).catch(() => '');
      if (bootDone === '1') {
         return newlyAttached;
      }
   }
   if (Date.now() >= deadline) {
      return '';
   }
   await delay(BOOT_POLL_MS);
   return pollEmulatorBoot(beforeSet, deadline);
}

export async function ensureAndroidEmulatorSession(avdName = DEFAULT_AVD_NAME) {
   const existing = listAttachedEmulators();
   if (existing.length > 0) {
      return {
         serial: existing[0],
         startedByRunner: false,
         close: () => Promise.resolve(true),
      };
   }

   const beforeSet = new Set(existing);
   const emulatorBin = findEmulatorBinary();
   process.stdout.write(`[talkback] Booting AVD ${avdName}...\n`);
   const child = spawn(
      emulatorBin,
      ['-avd', avdName, '-no-snapshot-load', '-no-audio', '-no-boot-anim'],
      {
         detached: true,
         stdio: 'ignore',
      },
   );
   child.unref();

   const serial = await pollEmulatorBoot(beforeSet, Date.now() + BOOT_TIMEOUT_MS);
   if (!serial) {
      throw new Error(`Timed out waiting for Android emulator "${avdName}" to boot.`);
   }

   await delay(POST_BOOT_SETTLE_MS);
   await runAdb(serial, ['shell', 'input', 'keyevent', 'KEYCODE_WAKEUP']).catch(
      ignoreError,
   );
   await runAdb(serial, ['shell', 'wm', 'dismiss-keyguard']).catch(ignoreError);

   return {
      serial,
      startedByRunner: true,
      close: async () => {
         await runAdb(serial, ['emu', 'kill']).catch(ignoreError);
      },
   };
}

async function readPackageVersion(serial, pkgName) {
   try {
      const dump = await runAdb(serial, ['shell', 'dumpsys', 'package', pkgName]);
      const match = /versionName=([^\s]+)/u.exec(dump);
      return match?.[1] ?? 'unknown';
   } catch {
      return 'unknown';
   }
}

export async function isPackageInstalled(serial, pkgName) {
   const packages = await runAdb(serial, [
      'shell',
      'pm',
      'list',
      'packages',
      pkgName,
   ]).catch(() => '');
   return packages.includes(`package:${pkgName}`);
}

async function dumpScreenXml(serial) {
   await runAdb(serial, ['shell', 'uiautomator', 'dump', '/sdcard/sr-ui.xml']).catch(
      ignoreError,
   );
   return runAdb(serial, ['shell', 'cat', '/sdcard/sr-ui.xml']).catch(() => '');
}

function findFirstRegexBounds(xml, patterns) {
   for (const pattern of patterns) {
      const match = pattern.exec(xml);
      if (match) {
         return {
            cx: Math.round(
               (Number(match[1]) + Number(match[REGEX_GROUP_X2])) / MIDPOINT_DIVISOR,
            ),
            cy: Math.round(
               (Number(match[REGEX_GROUP_Y1]) + Number(match[REGEX_GROUP_Y2])) /
                  MIDPOINT_DIVISOR,
            ),
         };
      }
   }
}

async function tapCrashDialogCloseIfPresent(serial, xml) {
   const patterns = [
      /<node\b[^>]*resource-id="android:id\/aerr_close"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/u,
      /<node\b[^>]*resource-id="android:id\/button1"[^>]*text="Close app"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/iu,
      /<node\b[^>]*text="Close app"[^>]*resource-id="android:id\/button1"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/iu,
   ];
   const coords = findFirstRegexBounds(xml, patterns);
   if (!coords) {
      return false;
   }
   await runAdb(serial, ['shell', 'input', 'tap', String(coords.cx), String(coords.cy)]);
   await delay(CRASH_DISMISS_DELAY_MS);
   return true;
}

async function dismissCrashLoops(serial, remaining, dismissedAny) {
   if (remaining <= 0) {
      return dismissedAny;
   }
   const xml = await dumpScreenXml(serial);
   const dismissed = await tapCrashDialogCloseIfPresent(serial, xml);
   if (!dismissed) {
      return dismissedAny;
   }
   return dismissCrashLoops(serial, remaining - 1, true);
}

function dismissSystemCrashDialogs(serial) {
   return dismissCrashLoops(serial, CRASH_MAX_ATTEMPTS, false);
}

function launchChromeWithUrl(serial, url) {
   return runAdb(serial, [
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      url,
      '-n',
      'com.android.chrome/com.google.android.apps.chrome.Main',
   ]);
}

function findOnboardingButtonCoords(xml, candidates) {
   for (const resID of candidates) {
      const pattern = new RegExp(
         `resource-id="${resID}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
         'u',
      );
      const match = pattern.exec(xml);
      if (match) {
         return {
            resID,
            cx: Math.round(
               (Number(match[1]) + Number(match[REGEX_GROUP_X2])) / MIDPOINT_DIVISOR,
            ),
            cy: Math.round(
               (Number(match[REGEX_GROUP_Y1]) + Number(match[REGEX_GROUP_Y2])) /
                  MIDPOINT_DIVISOR,
            ),
         };
      }
   }
}

async function findAndTapOnboardingMatch(serial, xml, candidates) {
   const found = findOnboardingButtonCoords(xml, candidates);
   if (!found) {
      return;
   }
   await runAdb(serial, ['shell', 'input', 'tap', String(found.cx), String(found.cy)]);
   await delay(CHROME_ONBOARDING_STEP_DELAY_MS);
   return found.resID;
}

async function runOnboardingStep({ serial, url, state, remaining }) {
   if (remaining <= 0) {
      return;
   }
   const xml = await dumpScreenXml(serial);
   const candidates = [
      'android:id/aerr_close',
      'com.android.chrome:id/signin_fre_dismiss_button',
      'com.android.chrome:id/terms_accept',
      'com.android.chrome:id/negative_button',
   ];
   const tappedId = await findAndTapOnboardingMatch(serial, xml, candidates);
   if (tappedId) {
      if (tappedId === 'android:id/aerr_close' && !state.relaunchedForCrash) {
         state.relaunchedForCrash = true;
         await launchChromeWithUrl(serial, url);
         await delay(CHROME_RELAUNCH_SETTLE_MS);
      }
      await runOnboardingStep({ serial, url, state, remaining: remaining - 1 });
      return;
   }

   const closedByText = await tapCrashDialogCloseIfPresent(serial, xml);
   if (closedByText && !state.relaunchedForCrash) {
      state.relaunchedForCrash = true;
      await launchChromeWithUrl(serial, url);
      await delay(CHROME_RELAUNCH_SETTLE_MS);
      await runOnboardingStep({ serial, url, state, remaining: remaining - 1 });
   }
}

export async function dismissChromeOnboarding(serial, url) {
   await launchChromeWithUrl(serial, url);
   await delay(CHROME_ONBOARDING_SETTLE_MS);
   await runOnboardingStep({
      serial,
      url,
      state: { relaunchedForCrash: false },
      remaining: CHROME_ONBOARDING_MAX_STEPS,
   });
}

export async function readAndroidDeviceInfo(serial, browser) {
   const [model, release, sdk, talkbackVersion, wmSize] = await Promise.all([
      runAdb(serial, ['shell', 'getprop', 'ro.product.model']).catch(
         () => 'Android Emulator',
      ),
      runAdb(serial, ['shell', 'getprop', 'ro.build.version.release']).catch(() => '13'),
      runAdb(serial, ['shell', 'getprop', 'ro.build.version.sdk']).catch(() => '33'),
      readPackageVersion(serial, 'com.google.android.marvin.talkback'),
      runAdb(serial, ['shell', 'wm', 'size']).catch(() => 'Physical size: 1080x2400'),
   ]);

   const sizeMatch = /(\d+)x(\d+)/u.exec(wmSize);
   const screenWidth = sizeMatch ? Number(sizeMatch[1]) : DEFAULT_WIDTH;
   const screenHeight = sizeMatch ? Number(sizeMatch[REGEX_GROUP_Y1]) : DEFAULT_HEIGHT;

   let browserLabel = 'Google Chrome';
   let browserVersion = 'unknown';
   let browserType = 'browser';
   let shortLabel = 'Android TB (Chrome)';

   if (browser === 'chrome') {
      browserVersion = await readPackageVersion(serial, 'com.android.chrome');
   } else if (browser === 'firefox') {
      browserLabel = 'Firefox';
      browserVersion = await readPackageVersion(serial, 'org.mozilla.firefox');
      shortLabel = 'Android TB (Firefox)';
   } else if (browser === 'webview') {
      browserLabel = 'Android System WebView';
      browserVersion = await readPackageVersion(serial, 'com.google.android.webview');
      if (browserVersion === 'unknown') {
         browserVersion = await readPackageVersion(serial, 'com.android.webview');
      }
      browserType = 'webview';
      shortLabel = 'Android TB (WebView)';
   }

   return {
      screenWidth,
      screenHeight,
      environment: {
         id: `android-talkback-${browser}`,
         label: `Android ${release} · ${browserLabel} ${browserVersion} · TalkBack`,
         shortLabel,
         platformGroup: 'android-talkback',
         device: `${model} (Android Emulator)`,
         os: 'Android',
         osVersion: `${release} (API ${sdk})`,
         browser: browserLabel,
         browserVersion,
         browserType,
         usageOrder: ANDROID_USAGE_ORDER[browser] ?? USAGE_FALLBACK,
         screenReader: 'TalkBack',
         screenReaderVersion: talkbackVersion,
      },
   };
}

export async function connectEmulatorConsole(serial) {
   const portMatch = /emulator-(\d+)/u.exec(serial);
   if (!portMatch) {
      throw new Error(`Unexpected emulator serial "${serial}".`);
   }
   const port = Number(portMatch[1]);
   const token = readFileSync(
      resolve(homedir(), '.emulator_console_auth_token'),
      'utf8',
   ).trim();
   const socket = net.createConnection({ host: '127.0.0.1', port });

   await new Promise((resolveConnect, rejectConnect) => {
      socket.once('connect', resolveConnect);
      socket.once('error', rejectConnect);
   });

   function send(command) {
      return new Promise((resolveCommand) => {
         let response = '';
         let timerHandle = false;

         function finish() {
            if (timerHandle) {
               clearTimeout(timerHandle);
            }
            socket.off('data', onData);
            resolveCommand(response);
         }

         function onData(chunk) {
            response += chunk.toString('utf8');
            if (
               response.includes('OK\r\n') ||
               response.includes('OK\n') ||
               response.includes('KO:')
            ) {
               finish();
            }
         }

         timerHandle = setTimeout(finish, EMU_CMD_TIMEOUT_MS);
         socket.on('data', onData);
         socket.write(`${command}\n`);
      });
   }

   await delay(BANNER_DRAIN_MS);
   const authResponse = await send(`auth ${token}`);
   if (authResponse.includes('KO:')) {
      socket.destroy();
      throw new Error(
         `Emulator console auth failed on port ${String(port)}: ${authResponse.trim()}`,
      );
   }

   return {
      send,
      close: () => {
         socket.end();
      },
   };
}

async function sendSwipeSteps({ emu, screenWidth, yPos, index = 0 }) {
   if (index >= SWIPE_X_RATIOS.length) {
      const finalX = Math.round(screenWidth * SWIPE_X_RATIOS.at(-1));
      await emu.send(`event mouse ${String(finalX)} ${String(yPos)} 0 0`);
      return;
   }
   const xPos = Math.round(screenWidth * SWIPE_X_RATIOS[index]);
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 1`);
   await delay(SWIPE_STEP_MS);
   await sendSwipeSteps({ emu, screenWidth, yPos, index: index + 1 });
}

export async function emuSwipeRight(emu, screenWidth, screenHeight) {
   const yPos = Math.round(screenHeight * SWIPE_Y_RATIO);
   await sendSwipeSteps({ emu, screenWidth, yPos });
}

export async function emuTouchExploreTap(emu, xPos, yPos) {
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 1`);
   await delay(TOUCH_EXPLORE_TAP_MS);
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 0`);
}

export async function emuDoubleTap(emu, screenWidth, screenHeight) {
   const xPos = Math.round(screenWidth * DOUBLE_TAP_RATIO);
   const yPos = Math.round(screenHeight * SWIPE_Y_RATIO);

   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 1`);
   await delay(DOUBLE_TAP_HOLD_MS);
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 0`);
   await delay(DOUBLE_TAP_GAP_MS);
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 1`);
   await delay(DOUBLE_TAP_HOLD_MS);
   await emu.send(`event mouse ${String(xPos)} ${String(yPos)} 0 0`);
}

export async function openUrlOnAndroid(serial, browser, url) {
   if (browser === 'chrome') {
      const startChrome = () =>
         runAdb(serial, [
            'shell',
            'am',
            'start',
            '-a',
            'android.intent.action.VIEW',
            '-d',
            url,
            '--es',
            'com.android.browser.application_id',
            'dev.a11ied.srrunner',
            '-n',
            'com.android.chrome/com.google.android.apps.chrome.Main',
         ]);
      await dismissSystemCrashDialogs(serial);
      await startChrome();
      await delay(NAV_SETTLE_MS);
      if (await dismissSystemCrashDialogs(serial)) {
         await startChrome();
         await delay(NAV_SETTLE_MS);
      }
      return;
   }
   if (browser === 'firefox') {
      await runAdb(serial, [
         'shell',
         'am',
         'start',
         '-a',
         'android.intent.action.VIEW',
         '-d',
         url,
         '-p',
         'org.mozilla.firefox',
      ]);
      await delay(NAV_SETTLE_MS);
      return;
   }
   if (browser === 'webview') {
      await runAdb(serial, ['shell', 'am', 'force-stop', 'com.android.chrome']).catch(
         ignoreError,
      );
      await dismissSystemCrashDialogs(serial);
      await runAdb(serial, [
         'shell',
         'am',
         'start',
         '-S',
         '-a',
         'android.intent.action.VIEW',
         '-d',
         url,
         '-n',
         'dev.a11ied.srwebview/.MainActivity',
      ]);
      await delay(WEBVIEW_NAV_SETTLE_MS);
   }
}
