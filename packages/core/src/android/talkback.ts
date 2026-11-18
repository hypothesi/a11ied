import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { CliEnvironmentError } from '../errors/cli-environment-error.js';

const execFileAsync = promisify(execFile);

const TALKBACK_SERVICE =
   'com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService';
const TALKBACK_PACKAGE = 'com.google.android.marvin.talkback';
/** Logcat dumps from a busy emulator run to several megabytes. */
const LOGCAT_BUFFER_BYTES = 67_108_864;
const SETTLE_MS = 2000;
const ENABLE_SETTLE_MS = 4000;
const SPOKEN_TEXT = /action=SPEAK\s+text="(?<text>[^"]*)"/u;
const VERBOSE_TALKBACK_LINE = /\sV talkback:/u;

/**
 * Keys a walk can press. Tab and Shift+Tab move keyboard focus, which TalkBack follows
 * and announces; Enter activates the focused item.
 */
export const TALKBACK_KEY_NAMES = ['next', 'previous', 'activate', 'up', 'down'] as const;
export type TalkBackKey = (typeof TALKBACK_KEY_NAMES)[number];

export const TALKBACK_KEYS: Readonly<Record<TalkBackKey, readonly string[]>> = {
   next: ['keyevent', 'KEYCODE_TAB'],
   previous: ['keycombination', 'KEYCODE_SHIFT_LEFT', 'KEYCODE_TAB'],
   activate: ['keyevent', 'KEYCODE_ENTER'],
   up: ['keyevent', 'KEYCODE_DPAD_UP'],
   down: ['keyevent', 'KEYCODE_DPAD_DOWN'],
};

export interface TalkBackStep {
   step: number;
   key: TalkBackKey;
   /** Everything TalkBack spoke after the key press, in order. */
   spoken: string[];
}

export interface AdbOptions {
   /** Device serial, for when more than one device or emulator is attached. */
   serial?: string | undefined;
}

export function isTalkBackKey(value: string): value is TalkBackKey {
   return Object.hasOwn(TALKBACK_KEYS, value);
}

/**
 * Reads the phrases TalkBack spoke from a logcat dump. TalkBack only logs its speech when
 * its log output level is VERBOSE (TalkBack settings > Advanced settings > Developer
 * settings).
 */
export function parseTalkBackSpeech(logcat: string): string[] {
   return logcat
      .split('\n')
      .filter((line) => line.includes('Pipeline: execute() feedback='))
      .map((line) => SPOKEN_TEXT.exec(line)?.groups?.['text'] ?? '')
      .filter((text) => text !== '');
}

async function adb(options: AdbOptions, args: readonly string[]): Promise<string> {
   const serial = options.serial === undefined ? [] : ['-s', options.serial];
   try {
      const { stdout } = await execFileAsync('adb', [...serial, ...args], {
         maxBuffer: LOGCAT_BUFFER_BYTES,
      });
      return stdout;
   } catch (error) {
      throw new CliEnvironmentError(
         'adb-failed',
         `adb ${args.join(' ')} failed. Check that adb is installed and one device is attached (adb devices).`,
         { cause: error instanceof Error ? error.message : String(error) },
      );
   }
}

function delay(ms: number): Promise<void> {
   return new Promise((resolve) => {
      setTimeout(resolve, ms);
   });
}

async function assertTalkBackInstalled(options: AdbOptions): Promise<void> {
   const packages = await adb(options, [
      'shell',
      'pm',
      'list',
      'packages',
      TALKBACK_PACKAGE,
   ]);
   if (!packages.includes(`package:${TALKBACK_PACKAGE}`)) {
      throw new CliEnvironmentError(
         'talkback-missing',
         'TalkBack is not installed on this device. Use a physical phone or a Google Play emulator image; Google APIs images do not include it.',
      );
   }
}

async function setTalkBack(options: AdbOptions, enabled: boolean): Promise<void> {
   await adb(options, [
      'shell',
      'settings',
      'put',
      'secure',
      'enabled_accessibility_services',
      enabled ? TALKBACK_SERVICE : '""',
   ]);
   await adb(options, [
      'shell',
      'settings',
      'put',
      'secure',
      'accessibility_enabled',
      enabled ? '1' : '0',
   ]);
}

export async function enableTalkBack(options: AdbOptions = {}): Promise<void> {
   await assertTalkBackInstalled(options);
   await setTalkBack(options, true);
   await delay(ENABLE_SETTLE_MS);
}

export async function disableTalkBack(options: AdbOptions = {}): Promise<void> {
   await setTalkBack(options, false);
}

async function pressAndListen(
   options: AdbOptions,
   key: TalkBackKey,
): Promise<{ spoken: string[]; verbose: boolean }> {
   await adb(options, ['logcat', '-c']);
   await adb(options, ['shell', 'input', ...TALKBACK_KEYS[key]]);
   await delay(SETTLE_MS);
   const log = await adb(options, ['logcat', '-d']);
   return { spoken: parseTalkBackSpeech(log), verbose: VERBOSE_TALKBACK_LINE.test(log) };
}

async function walkFrom(
   options: AdbOptions,
   keys: readonly TalkBackKey[],
   done: { steps: TalkBackStep[]; sawVerboseLog: boolean },
): Promise<{ steps: TalkBackStep[]; sawVerboseLog: boolean }> {
   const key = keys[done.steps.length];
   if (key === undefined) {
      return done;
   }
   const heard = await pressAndListen(options, key);
   return walkFrom(options, keys, {
      steps: [...done.steps, { step: done.steps.length + 1, key, spoken: heard.spoken }],
      sawVerboseLog: done.sawVerboseLog || heard.verbose,
   });
}

/**
 * Presses keys one at a time with TalkBack on and records what it spoke after each press.
 * Fails when TalkBack logged nothing at all, which means its verbose logging is off.
 */
export async function walkWithTalkBack(
   input: AdbOptions & { keys: readonly TalkBackKey[] },
): Promise<TalkBackStep[]> {
   const walked = await walkFrom(input, input.keys, { steps: [], sawVerboseLog: false });
   if (!walked.sawVerboseLog) {
      throw new CliEnvironmentError(
         'talkback-not-logging',
         'TalkBack did not log any speech. Turn TalkBack on (a1 talkback on) and set TalkBack settings > Advanced settings > Developer settings > Log output level to VERBOSE.',
      );
   }
   return walked.steps;
}
