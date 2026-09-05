/*
 * The runner-agnostic test API: `a11ied/test`. It works under Vitest, Jest, Mocha,
 * Playwright Test, or a plain script, because it depends on nothing but the package.
 */
export {
   CliEnvironmentError,
   CliUsageError,
   DriverCommandError,
   screenReader,
   ScreenReader,
   ScreenReaderAssertionError,
} from '@a11ied/core';

export type {
   LoopOptions,
   NavigateOptions,
   ScreenReaderDocument,
   ScreenReaderOptions,
   ScreenReaderRunOptions,
   ScreenReaderSession,
   SpokenMatch,
   SpokenOptions,
   WaitOptions,
   WantedItem,
} from '@a11ied/core';

export type {
   DriverCurrentItem,
   DriverLoopItem,
   DriverNavigationKind,
   DriverTableMove,
   DriverTranscriptEntry,
   Platform,
   VirtualEngine,
} from '@a11ied/contracts';
