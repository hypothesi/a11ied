import { createDriverSessionContext } from './session-context.js';

/** Keep lifecycle fixtures independent of native readers and persistent session files. */
export function createVirtualContextFixture(
   sessionID: string,
): ReturnType<typeof createDriverSessionContext> {
   return createDriverSessionContext({
      target: 'virtual',
      sessionId: sessionID,
      metadataFile: `in-memory://${sessionID}`,
      socketPath: `in-memory://${sessionID}`,
      persist: false,
      engine: 'jsdom',
   });
}
