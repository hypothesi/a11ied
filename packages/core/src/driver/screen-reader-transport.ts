import type {
   DriverActionRequestInput,
   DriverActionResult,
   DriverMode,
   Platform,
   VirtualEngine,
} from '@a11ied/contracts';

/** One action's outcome as the test API reads it: the state after it and its details. */
export type ScreenReaderStep = Pick<DriverActionResult, 'action' | 'state' | 'details'>;

/** What a test can know about its session: which reader, where it runs, what it opened. */
export interface ScreenReaderSession {
   sr: Platform;
   /**
    * `in-process` runs the reader inside the test process. `broker` uses the detached
    * process `a1 sr` shares.
    */
   mode: DriverMode;
   /** The engine of a virtual session: `browser` for a Playwright page, `jsdom` otherwise. */
   engine?: VirtualEngine | undefined;
   /** The page the session last opened. */
   url?: string | undefined;
}

/** A page to open: a URL, or inline HTML with an optional URL to record as its location. */
export interface ScreenReaderDocument {
   url?: string | undefined;
   html?: string | undefined;
}

export interface ScreenReaderRunOptions {
   /** Bounds the screen reader command behind one call. */
   timeoutMs?: number | undefined;
}

/**
 * Where a `ScreenReader` sends its actions. The in-process and browser runners run them
 * on an adapter they hold. The broker transport sends them to the detached process.
 */
export interface ScreenReaderTransport {
   readonly session: ScreenReaderSession;
   run(
      request: DriverActionRequestInput,
      options?: ScreenReaderRunOptions,
   ): Promise<ScreenReaderStep>;
   open(document: ScreenReaderDocument): Promise<ScreenReaderStep>;
   status(): Promise<ScreenReaderStep>;
   stop(): Promise<void>;
}
