import {
   DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
   type DriverActionRequestInput,
} from '@a11ied/contracts';

import { parseActionRequest } from './broker-actions.js';
import type { ActionContext } from './broker-types.js';
import {
   captureContextState,
   runContextAction,
   runContextWait,
} from './context-action.js';
import { cleanupAfterError, closeContext, withContextCommand } from './context-queue.js';
import type {
   ScreenReaderDocument,
   ScreenReaderRunOptions,
   ScreenReaderSession,
   ScreenReaderStep,
   ScreenReaderTransport,
} from './screen-reader-transport.js';

export interface ContextTransportOptions {
   context: ActionContext;
   session: ScreenReaderSession;
   /** Bounds every command unless a call passes its own `timeoutMs`. */
   timeoutMs?: number | undefined;
   /**
    * Turns what a test asked to open into the document the adapter attaches: the jsdom
    * engine needs the page fetched, the browser engine navigates on its own.
    */
   load: (document: ScreenReaderDocument) => Promise<{ html: string; url: string }>;
   /** Stops the adapter and whatever else the runner started, such as a recording. */
   stop: () => Promise<void>;
}

/**
 * A transport over an action context the runner holds itself: the in-process runner in
 * Node and the browser runner in Vitest browser mode. It runs the same action code the
 * broker runs, minus the session file and the socket.
 */
export function createContextTransport(
   options: ContextTransportOptions,
): ScreenReaderTransport {
   const { context, session } = options;
   return {
      session,
      async run(
         request: DriverActionRequestInput,
         runOptions: ScreenReaderRunOptions = {},
      ): Promise<ScreenReaderStep> {
         const parsed = parseActionRequest(
            request.action,
            'payload' in request ? request.payload : undefined,
         );
         const timeoutMs = runOptions.timeoutMs ?? options.timeoutMs;
         if (parsed.action === 'wait') {
            return runContextWait(context, parsed.payload, async (result) => result);
         }
         return withContextCommand(context, () =>
            runContextAction(
               context,
               parsed,
               timeoutMs === undefined ? {} : { timeoutMs },
            ),
         );
      },
      async open(document: ScreenReaderDocument): Promise<ScreenReaderStep> {
         try {
            return await withContextCommand(context, async () => {
               const loaded = await options.load(document);
               await context.adapter.attachDocument(loaded);
               session.url = loaded.url;
               const state = await captureContextState(context, {
                  tail: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
                  limit: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
               });
               return { action: 'attach-document', state, details: { url: loaded.url } };
            });
         } catch (error) {
            return cleanupAfterError(() => closeContext(context, options.stop), error);
         }
      },
      async status(): Promise<ScreenReaderStep> {
         return withContextCommand(context, async () => ({
            action: 'status',
            state: await captureContextState(context, {
               tail: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
               limit: DEFAULT_DRIVER_TRANSCRIPT_LIMIT,
            }),
         }));
      },
      stop: () => closeContext(context, options.stop),
   };
}
