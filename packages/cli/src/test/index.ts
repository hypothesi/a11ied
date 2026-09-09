/*
 * The runner-agnostic test API: `a11ied/test`. It works under Vitest, Jest, Mocha,
 * Playwright Test, or a plain script, because it depends on nothing but the package.
 */
export {
   CliEnvironmentError,
   CliUsageError,
   CommandQueue,
   DriverCommandError,
   queuedScreenReader,
   queueScreenReader,
   screenReader,
   ScreenReader,
   ScreenReaderAssertionError,
} from '@a11ied/core';

export type {
   CommandQueueOptions,
   LoopOptions,
   NavigateOptions,
   Queued,
   QueuedScreenReader,
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
