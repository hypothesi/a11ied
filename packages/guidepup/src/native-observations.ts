import {
   driverStateSnapshotSchema,
   type AxFocusedElement,
   type DriverCheckpoint,
   type DriverCurrentItem,
   type DriverStateSnapshot,
} from '@a11ied/contracts';
import { buildStateSnapshot } from './adapter-shared.js';
import { queryFocusedAxProperties } from './ax-properties-mac.js';
import { parseNvdaItem, parseVoiceOverItem } from './current-item.js';
import { DriverCommandError } from './driver-command-error.js';
import type { ScreenReaderLike } from './readiness.js';
import type { RealTarget } from './real-steps.js';
import { readFrontmostWindow } from './window-focus.js';
import { isNativeDesktopLocked, isNativeTargetAvailable } from './native-input-target.js';

type KeyboardFocusObservation = NonNullable<
   DriverStateSnapshot['observations']
>['keyboardFocus'];

async function observeMacKeyboardFocus(): Promise<{
   axFocusedElement?: AxFocusedElement;
   observation: KeyboardFocusObservation;
}> {
   try {
      const axFocusedElement = await queryFocusedAxProperties();
      if (axFocusedElement) {
         return {
            axFocusedElement,
            observation: { status: 'observed', source: 'macos-ax' },
         };
      }
      return {
         observation: {
            status: 'unavailable',
            source: 'macos-ax',
            reason: 'No keyboard-focus properties were returned.',
         },
      };
   } catch (error) {
      return {
         observation: {
            status: 'unavailable',
            source: 'macos-ax',
            code:
               error instanceof DriverCommandError
                  ? error.code
                  : 'keyboard-focus-query-failed',
            reason:
               (error instanceof Error ? error.message : String(error)) ||
               'Keyboard-focus query failed.',
         },
      };
   }
}

/** Optional focus failure diagnostics survive without replacing mandatory speech errors. */
export async function readNativeState(
   reader: ScreenReaderLike,
   target: RealTarget,
   checkpoints: DriverCheckpoint[],
): Promise<DriverStateSnapshot> {
   async function readParsedItem(
      phrase: string,
      itemText: string,
   ): Promise<DriverCurrentItem> {
      return target === 'voiceover'
         ? parseVoiceOverItem(phrase, itemText)
         : parseNvdaItem(phrase, itemText);
   }
   const [snapshot, focus, foreground] = await Promise.all([
      buildStateSnapshot(reader, checkpoints, readParsedItem),
      target === 'voiceover'
         ? observeMacKeyboardFocus()
         : Promise.resolve({
              observation: {
                 status: 'unsupported',
                 source: 'nvda-remote',
                 reason:
                    'The installed NVDA connection does not expose native keyboard focus.',
              } satisfies KeyboardFocusObservation,
           }),
      readFrontmostWindow(),
   ]);
   return driverStateSnapshotSchema.parse({
      ...snapshot,
      foreground,
      ...('axFocusedElement' in focus
         ? { axFocusedElement: focus.axFocusedElement }
         : {}),
      observations: {
         keyboardFocus: focus.observation,
         readerCursorIdentity: {
            status: 'unsupported',
            source: target,
            reason:
               'Reader text does not identify the native cursor element or document.',
         },
         targetIdentity: isNativeTargetAvailable(foreground)
            ? { status: 'observed', source: 'os-foreground' }
            : {
                 status: 'unavailable',
                 source: target,
                 reason: isNativeDesktopLocked(foreground)
                    ? 'The desktop is locked.'
                    : 'The foreground application and window could not be observed.',
              },
      },
   });
}
